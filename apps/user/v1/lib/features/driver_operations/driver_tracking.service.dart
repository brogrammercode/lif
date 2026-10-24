import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';

class DriverTrackingService {
  static final instance = DriverTrackingService._();
  DriverTrackingService._();
  @visibleForTesting
  DriverTrackingService.forTesting();
  final position = ValueNotifier<Position?>(null);
  final error = ValueNotifier<String?>(null);
  final _repo = DriverOperationsRepository();
  StreamSubscription<Position>? _stream;
  Timer? _heartbeat;
  Future<void>? _starting;
  bool _sending = false;
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

  Future<void> ensureStarted() =>
      _starting ??= _start().whenComplete(() => _starting = null);
  Future<void> _start() async {
    if (running) return;
    final generation = ++_generation;
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw StateError('Turn on device location services to drive.');
    }
    var permission = await Geolocator.checkPermission();
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
    if (_sending || generation != _generation) return;
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
    if (_sending || generation != _generation) return;
    _sending = true;
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
      _sending = false;
      done.complete();
      _uploadDone = null;
    }
  }

  Future<void> freshFix() async {
    await _uploadDone?.future;
    if (!running) {
      await ensureStarted();
      return;
    }
    await _refresh(_generation);
    if (error.value != null) throw StateError(error.value!);
  }

  Future<void> stop({bool goOffline = false}) async {
    final wasTracking = running || _starting != null;
    _generation++;
    _heartbeat?.cancel();
    _heartbeat = null;
    await _stream?.cancel();
    _stream = null;
    if (goOffline && wasTracking) {
      try {
        await _repo.availability(false);
      } catch (_) {}
    }
    position.value = null;
    error.value = null;
  }
}
