import 'package:user/core/network/api_result.dart';
import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class PaymentMethodsController extends FeatureController {
  PaymentMethodsController(this._repository);

  final UserAppRepository _repository;
  List<Map<String, dynamic>> methods = const [];
  String? error;
  bool loading = true;
  bool saving = false;

  Future<void> load() async {
    update(() {
      loading = true;
      error = null;
    });
    try {
      final records = await _repository.paymentMethods();
      update(() {
        methods = records
            .where(
              (method) => method['type'] == 'CARD' || method['type'] == 'UPI',
            )
            .toList(growable: false);
      });
    } catch (failure) {
      update(() => error = ApiResult.errorMessage(failure));
    } finally {
      update(() => loading = false);
    }
  }

  Future<String?> saveUpi(String input) async {
    final id = input.trim();
    if (id.length > 120 ||
        !RegExp(
          r'^[a-z0-9._-]+@[a-z0-9]+$',
          caseSensitive: false,
        ).hasMatch(id)) {
      return 'Enter a valid UPI ID, such as name@bank.';
    }
    return _save(() async {
      await _repository.addPaymentMethod({'type': 'UPI', 'upi_handle': id});
    });
  }

  Future<String?> remove(String id) => _save(() async {
    await _repository.deletePaymentMethod(id);
  });

  Future<String?> _save(Future<void> Function() action) async {
    if (isDisposed || saving) {
      return 'A payment method update is already in progress.';
    }
    update(() => saving = true);
    try {
      await action();
      if (!isDisposed) await load();
      return null;
    } catch (failure) {
      return ApiResult.errorMessage(failure);
    } finally {
      update(() => saving = false);
    }
  }
}
