import 'package:flutter/foundation.dart';

/// Lifecycle guard shared by feature controllers. Widgets never own its records.
abstract class FeatureController extends ChangeNotifier {
  bool _disposed = false;
  bool get isDisposed => _disposed;
  void update(VoidCallback change) {
    if (_disposed) return;
    change();
    notifyListeners();
  }

  void changed() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
