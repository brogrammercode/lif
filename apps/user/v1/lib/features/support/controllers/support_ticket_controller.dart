import 'package:user/core/state/feature_controller.dart';
import 'dart:async';

import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class SupportTicketController extends FeatureController {
  SupportTicketController(this.repository);
  String? notice;
  final UserAppRepository repository;
  Map<String, dynamic>? ticket;
  String? myUserId;
  Object? error;
  late String ticketId;
  bool loading = true;
  bool sending = false;
  int generation = 0;
  Future<void> loadProfile() async {
    try {
      final profile = await repository.profile();
      if (!isDisposed) update(() => myUserId = '${profile['id'] ?? ''}');
    } catch (_) {
      // Message ownership falls back to the first participant below.
    }
  }

  Future<void> load({bool preserve = false}) async {
    final generation = ++this.generation;
    if (ticketId.isEmpty) {
      if (!isDisposed) {
        update(() {
          error = StateError('This support request is unavailable.');
          loading = false;
        });
      }
      return;
    }
    if (!preserve && !isDisposed) update(() => loading = true);
    try {
      final value = await repository.supportTicket(ticketId);
      if (isDisposed || generation != this.generation) return;
      update(() {
        ticket = value;
        error = null;
        loading = false;
      });
    } catch (error) {
      if (isDisposed || generation != this.generation) return;
      if (preserve && ticket != null) {
        notice = ApiResult.errorMessage(error);
        return;
      }
      update(() {
        this.error = error;
        loading = false;
      });
    }
  }
}
