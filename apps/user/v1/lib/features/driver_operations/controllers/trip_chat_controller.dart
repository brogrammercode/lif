import 'dart:math';
import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';

class TripChatController extends FeatureController {
  final DriverOperationsRepository repository;
  final String id;
  String? userId, error, _pendingText, _pendingKey;
  List<Map<String, dynamic>> messages = [];
  bool loading = true, sending = false, _refreshing = false;
  TripChatController({required this.repository, required this.id, this.userId});
  Future<void> load() async {
    if (_refreshing || isDisposed) return;
    _refreshing = true;
    try {
      userId ??= (await AuthRepository().currentUser()).id;
      if (isDisposed) return;
      final next = await repository.messages(id);
      update(() {
        messages = next;
        error = null;
        loading = false;
      });
    } catch (e) {
      update(() {
        error = ApiResult.errorMessage(e);
        loading = false;
      });
    } finally {
      _refreshing = false;
    }
  }

  Future<bool> send(String text) async {
    final body = text.trim();
    if (sending || body.isEmpty || isDisposed) return false;
    if (_pendingText != body) {
      _pendingText = body;
      _pendingKey = List.generate(
        16,
        (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join();
    }
    update(() => sending = true);
    try {
      await repository.sendMessage(id, body, _pendingKey!);
      if (isDisposed) return false;
      _pendingText = null;
      _pendingKey = null;
      await load();
      return true;
    } finally {
      update(() => sending = false);
    }
  }
}
