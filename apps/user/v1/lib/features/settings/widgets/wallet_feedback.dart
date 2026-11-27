import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';

void showWalletError(BuildContext context, String message) {
  const background = Color(0xFF262124);
  final content = Row(
    children: [
      const Icon(Icons.error_outline, size: 17, color: Color(0xFFFFB4AB)),
      const SizedBox(width: 10),
      Expanded(
        child: Text(
          message,
          style: const TextStyle(fontSize: 12, color: Colors.white),
        ),
      ),
    ],
  );
  if (ModalRoute.of(context) case final PopupRoute<dynamic> route) {
    final overlay = Overlay.of(context, rootOverlay: true);
    _sheetNotice?.call();
    late final OverlayEntry entry;
    late final Timer timer;
    var dismissed = false;
    void dismiss() {
      if (dismissed) return;
      dismissed = true;
      timer.cancel();
      entry.remove();
      entry.dispose();
      _sheetNotice = null;
    }

    entry = OverlayEntry(
      builder: (context) => Positioned(
        left: 0,
        right: 0,
        bottom: MediaQuery.viewInsetsOf(context).bottom,
        child: IgnorePointer(
          child: Material(
            color: background,
            child: SafeArea(
              top: false,
              minimum: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: content,
            ),
          ),
        ),
      ),
    );
    overlay.insert(entry);
    timer = Timer(const Duration(seconds: 4), dismiss);
    _sheetNotice = dismiss;
    unawaited(route.completed.then((_) => dismiss()));
    return;
  }
  final messenger = ScaffoldMessenger.maybeOf(context);
  messenger?.hideCurrentSnackBar();
  messenger?.showSnackBar(
    SnackBar(
      behavior: SnackBarBehavior.fixed,
      backgroundColor: background,
      content: content,
    ),
  );
}

VoidCallback? _sheetNotice;

class WalletErrorNotice extends StatefulWidget {
  const WalletErrorNotice({
    super.key,
    required this.message,
    required this.child,
  });
  final String? message;
  final Widget child;

  @override
  State<WalletErrorNotice> createState() => _WalletErrorNoticeState();
}

class _WalletErrorNoticeState extends State<WalletErrorNotice> {
  @override
  void initState() {
    super.initState();
    _notify();
  }

  @override
  void didUpdateWidget(covariant WalletErrorNotice oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.message != widget.message) _notify();
  }

  void _notify() {
    final message = widget.message;
    if (message == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted &&
          widget.message == message &&
          ModalRoute.isCurrentOf(context) != false) {
        showWalletError(context, message);
      }
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class WalletShimmer extends StatelessWidget {
  const WalletShimmer({super.key, this.width, this.height = 14});
  final double? width;
  final double height;

  @override
  Widget build(BuildContext context) => AppSkeleton(
    child: SkeletonBox(width: width, height: height),
  );
}
