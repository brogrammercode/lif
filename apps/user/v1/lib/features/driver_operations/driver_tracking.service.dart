import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';

class DriverTrackingService {
  static final instance = DriverTrackingService._();
  DriverTrackingService._() : _repo = DriverOperationsRepository();
  @visibleForTesting
  DriverTrackingService.forTesting({DriverOperationsRepository? repository})
    : _repo = repository ?? DriverOperationsRepository();
  final position = ValueNotifier<Position?>(null);
  final error = ValueNotifier<String?>(null);
  final DriverOperationsRepository _repo;
  StreamSubscription<Position>? _stream;
  Timer? _heartbeat;
  Future<void>? _starting;
  int? _sendingGeneration;
  Completer<void>? _uploadDone;
  int _generation = 0;
  bool get running => _stream != null;

  Future<void> syncTrip({
    required bool activeTrip,
    required String? availability,
  }) async {
    // A history page must not stop tracking for a different ongoing trip.
    if (activeTrip ||
        ['AVAILABLE', 'EN_ROUTE', 'ON_TRIP'].contains(availability)) {
      await ensureStarted();
    } else if (availability != null) {
      await stop();
    }
  }

  Future<void> ensureStarted() {
    if (_starting != null) return _starting!;
    late final Future<void> starting;
    starting = _start().whenComplete(() {
      if (identical(_starting, starting)) _starting = null;
    });
    return _starting = starting;
  }

  Future<void> _start() async {
    if (running) return;
    final generation = ++_generation;
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw StateError('Turn on device location services to drive.');
    }
    if (generation != _generation) return;
    var permission = await Geolocator.checkPermission();
    if (generation != _generation) return;
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw StateError(
        'Allow precise location in app settings before going online.',
      );
    }
    if (generation != _generation) return;
    LocationSettings settings = const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 5,
    );
    if (defaultTargetPlatform == TargetPlatform.android) {
      settings = AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
        intervalDuration: const Duration(seconds: 5),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: '1More driver location',
          notificationText:
              'Location is shared while you are online or on a trip.',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    } else if (defaultTargetPlatform == TargetPlatform.iOS) {
      settings = AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
        activityType: ActivityType.automotiveNavigation,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
      );
    }
    final fix = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 20),
      ),
    );
    if (generation != _generation) return;
    position.value = fix;
    await _upload(fix, generation);
    if (generation != _generation) return;
    _stream = Geolocator.getPositionStream(locationSettings: settings).listen(
      (fix) {
        if (generation == _generation) {
          position.value = fix;
          unawaited(_upload(fix, generation).catchError((Object _) {}));
        }
      },
      onError: (Object e) {
        if (generation == _generation) error.value = ApiResult.errorMessage(e);
      },
      onDone: () {
        if (generation == _generation) {
          _stream = null;
          _heartbeat?.cancel();
          _heartbeat = null;
          error.value =
              'Location tracking stopped. Refresh location to reconnect.';
        }
      },
    );
    _heartbeat = Timer.periodic(
      const Duration(seconds: 10),
      (_) => unawaited(_refresh(generation)),
    );
  }

  Future<void> _refresh(int generation) async {
    if (_sendingGeneration == generation || generation != _generation) return;
    try {
      final fix = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 8),
        ),
      );
      if (generation != _generation) return;
      position.value = fix;
      await _upload(fix, generation);
    } catch (e) {
      if (generation == _generation) error.value = ApiResult.errorMessage(e);
    }
  }

  Future<void> _upload(Position fix, int generation) async {
    if (_sendingGeneration == generation || generation != _generation) return;
    _sendingGeneration = generation;
    final done = _uploadDone = Completer<void>();
    try {
      await _repo.location({
        'latitude': fix.latitude,
        'longitude': fix.longitude,
        'accuracy_m': fix.accuracy,
        'captured_at': fix.timestamp.toUtc().toIso8601String(),
        'heading': fix.heading.isFinite && fix.heading >= 0
            ? fix.heading % 360
            : 0,
        'speed_kph': fix.speed.isFinite && fix.speed > 0
            ? (fix.speed * 3.6).clamp(0, 500)
            : 0,
      });
      if (generation == _generation) error.value = null;
    } catch (e) {
      if (generation == _generation) error.value = ApiResult.errorMessage(e);
      rethrow;
    } finally {
      done.complete();
      if (identical(_uploadDone, done)) {
        _sendingGeneration = null;
        _uploadDone = null;
      }
    }
  }

  Future<void> freshFix() async {
    final generation = _generation;
    if (_sendingGeneration == generation) await _uploadDone?.future;
    if (generation != _generation) {
      throw StateError(
        'Location tracking stopped. Refresh location before driving.',
      );
    }
    if (!running) {
      await ensureStarted();
      if (!running) {
        throw StateError(
          'Location tracking stopped. Refresh location before driving.',
        );
      }
      return;
    }
    await _refresh(generation);
    if (generation != _generation) {
      throw StateError(
        'Location tracking stopped. Refresh location before driving.',
      );
    }
    if (error.value != null) throw StateError(error.value!);
  }

  Future<void> stop({bool goOffline = false}) async {
    final wasTracking = running || _starting != null;
    final generation = ++_generation;
    _starting = null;
    _heartbeat?.cancel();
    _heartbeat = null;
    final stream = _stream;
    _stream = null;
    position.value = null;
    error.value = null;
    await stream?.cancel();
    if (goOffline && wasTracking && generation == _generation) {
      try {
        await _repo.availability(false);
      } catch (_) {}
    }
  }
}
