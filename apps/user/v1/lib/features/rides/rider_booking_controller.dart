import 'package:flutter/foundation.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns one immutable booking attempt, including reconciliation after lost replies.
class RiderBookingController extends ChangeNotifier {
  final UserAppRepository repository;
  bool busy = false, attempted = false;
  String? error, _draft, _quote, _method, _note, _key;
  int? _passengers;
  bool _disposed = false;
  RiderBookingController(this.repository);
  void _changed() {
    if (!_disposed) notifyListeners();
  }

  Future<String?> _reconcile() async {
    final trip = await repository.ride(_draft!);
    if (trip['id'] != _draft) {
      throw StateError('The booking identity could not be verified.');
    }
    if ([
      ...riderActiveStatuses,
      ...riderTerminalStatuses,
    ].contains(trip['status'])) {
      return _draft;
    }
    if (trip['status'] != 'DRAFT') {
      throw StateError(
        'The booking status could not be verified. Retry this request.',
      );
    }
    return null;
  }

  Future<String?> submit({
    required String draft,
    required Map<String, dynamic> quote,
    required String method,
    required String note,
    required int passengers,
  }) async {
    if (busy) return null;
    busy = true;
    error = null;
    _changed();
    try {
      if (attempted) {
        final committed = await _reconcile();
        if (committed != null) return committed;
      } else {
        final expires = DateTime.tryParse('${quote['expires_at']}');
        if (expires == null || !expires.isAfter(DateTime.now())) {
          throw StateError('This quote has expired. Get fresh ride options.');
        }
        _draft = draft;
        _quote = '${quote['id']}';
        _method = method;
        _note = note.trim();
        _passengers = passengers;
        _key = 'booking-$draft-${DateTime.now().microsecondsSinceEpoch}';
        attempted = true;
      }
      final result = await repository.requestRide(
        _draft!,
        _quote!,
        method: _method!,
        note: _note,
        passengerCount: _passengers!,
        requestKey: _key,
      );
      if (result['id'] != _draft ||
          ![
            ...riderActiveStatuses,
            ...riderTerminalStatuses,
          ].contains(result['status'])) {
        throw StateError('The booking reply could not be verified.');
      }
      return _draft;
    } catch (e) {
      if (attempted) {
        try {
          final committed = await _reconcile();
          if (committed != null) return committed;
        } catch (_) {}
      }
      error = ApiResult.errorMessage(e);
      return null;
    } finally {
      busy = false;
      _changed();
    }
  }

  /// Fresh quotes are safe only after the previous request is verified as a draft.
  Future<bool> canRefresh() async {
    if (busy) return false;
    if (!attempted) return true;
    busy = true;
    _changed();
    try {
      if (await _reconcile() != null) {
        error = 'This ride was booked. Retry to open your trip.';
        return false;
      }
      attempted = false;
      return true;
    } catch (e) {
      error = ApiResult.errorMessage(e);
      return false;
    } finally {
      busy = false;
      _changed();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
