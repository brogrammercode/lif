import 'dart:async';
import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/rider_booking_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class VehicleSelectionController extends FeatureController {
  final UserAppRepository repository;
  final Map<String, dynamic> input;
  late final RiderBookingController booking = RiderBookingController(repository)
    ..addListener(changed);
  Map<String, dynamic> quote;
  int selected = 0, passengers = 1, _generation = 0;
  String method = 'CASH', note = '';
  String? error;
  bool loading = false, previewLoading = false;
  List<Map<String, dynamic>> previews = [];
  Timer? _clock;
  VehicleSelectionController({
    required this.repository,
    required this.input,
    required this.quote,
  }) {
    select(0);
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_visible) changed();
    });
  }
  bool _visible = true;
  List<Map<String, dynamic>> get quotes => rideMaps(quote['quotes']);
  Map<String, dynamic> get selectedQuote =>
      quotes.isEmpty ? {} : quotes[selected.clamp(0, quotes.length - 1)];
  Map<String, dynamic> get category =>
      rideMap(selectedQuote['category_snapshot']);
  String? driverDistanceLabel(Map<String, dynamic> preview) {
    final distance = rideNumber(preview['distance_m']);
    if (distance == null || distance < 0) return null;
    if (distance < 1000) return '${distance.round()} m away';
    final roundedKm = (distance / 100).round() / 10;
    return '${roundedKm.toStringAsFixed(1)} km away';
  }

  List<String> get methods => [
    if (rideMap(category['payment_policy'])['cash_enabled'] != false) 'CASH',
    if (rideMap(category['payment_policy'])['direct_upi_enabled'] == true)
      'UPI',
  ];
  bool get expired =>
      !(DateTime.tryParse(
            '${selectedQuote['expires_at']}',
          )?.isAfter(DateTime.now()) ??
          false);
  bool get locked => booking.attempted || booking.busy || loading;
  void setVisible(bool value) {
    _visible = value;
    if (value && !locked) unawaited(availability());
  }

  void select(int index) {
    if (locked || index < 0 || index >= quotes.length) return;
    update(() {
      selected = index;
      passengers = 1;
      if (!methods.contains(method) && methods.isNotEmpty) {
        method = methods.first;
      }
    });
    unawaited(availability());
  }

  void changePassengers(int delta) {
    if (locked) return;
    update(
      () => passengers = (passengers + delta).clamp(
        1,
        (rideNumber(category['capacity']) ?? 1).toInt(),
      ),
    );
    unawaited(availability());
  }

  void changeMethod(String value) {
    if (locked || !methods.contains(value)) return;
    update(() => method = value);
    unawaited(availability());
  }

  void changeNote(String value) {
    if (!locked) note = value;
  }

  Future<void> availability() async {
    if (isDisposed || quotes.isEmpty) return;
    final generation = ++_generation;
    update(() {
      previewLoading = true;
      previews = [];
    });
    try {
      final data = await repository.rideAvailability(
        '${quote['id']}',
        '${selectedQuote['id']}',
        method,
        passengers,
      );
      if (isDisposed || generation != _generation) return;
      update(() {
        previews = rideMaps(data['items']);
        error = null;
      });
    } catch (e) {
      if (!isDisposed && generation == _generation) {
        update(() => error = ApiResult.errorMessage(e));
      }
    } finally {
      if (!isDisposed && generation == _generation) {
        update(() => previewLoading = false);
      }
    }
  }

  Future<void> refresh() async {
    if (!await booking.canRefresh() || isDisposed) return;
    update(() => loading = true);
    try {
      final next = await repository.requestQuote(input);
      if (isDisposed) return;
      update(() {
        quote = next;
        selected = 0;
        passengers = 1;
        error = null;
        loading = false;
      });
      select(0);
    } catch (e) {
      if (!isDisposed) update(() => error = ApiResult.errorMessage(e));
    } finally {
      if (!isDisposed) update(() => loading = false);
    }
  }

  Future<String?> submit() => booking.submit(
    draft: '${quote['id']}',
    quote: selectedQuote,
    method: method,
    note: note,
    passengers: passengers,
  );
  Future<bool> canLeave() => booking.canRefresh();
  @override
  void dispose() {
    _clock?.cancel();
    booking.removeListener(changed);
    booking.dispose();
    super.dispose();
  }
}
