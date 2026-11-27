import 'dart:async';
import 'package:flutter/material.dart';

/// Shows the app's payment-style error or warning above the active page,
/// dialog or sheet, attached to the bottom edge or the keyboard.
void showAppError(BuildContext context, String message) {
  if (!context.mounted || message.trim().isEmpty) return;
  final route = ModalRoute.of(context);
  if (route?.isCurrent == false) return;
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;

  _dismissCurrent?.call();
  final entry = OverlayEntry(
    builder: (context) => Positioned(
      left: 0,
      right: 0,
      bottom: MediaQuery.viewInsetsOf(context).bottom,
      child: IgnorePointer(
        child: Material(
          color: const Color(0xFF262124),
          child: SafeArea(
            top: false,
            minimum: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Semantics(
              liveRegion: true,
              child: Row(
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 17,
                    color: Color(0xFFFFB4AB),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      message,
                      style: const TextStyle(fontSize: 12, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );

  late final Timer timer;
  var dismissed = false;
  void dismiss() {
    if (dismissed) return;
    dismissed = true;
    timer.cancel();
    entry.remove();
    entry.dispose();
    _dismissCurrent = null;
  }

  overlay.insert(entry);
  timer = Timer(const Duration(seconds: 4), dismiss);
  _dismissCurrent = dismiss;
  if (route != null) unawaited(route.completed.then((_) => dismiss()));
}

VoidCallback? _dismissCurrent;

/// Turns changes in a controller or async builder into one snackbar per error.
class AppErrorNotice extends StatefulWidget {
  const AppErrorNotice({
    super.key,
    required this.message,
    this.child = const SizedBox.shrink(),
  });
  final String? message;
  final Widget child;

  @override
  State<AppErrorNotice> createState() => _AppErrorNoticeState();
}

class _AppErrorNoticeState extends State<AppErrorNotice> {
  @override
  void initState() {
    super.initState();
    _notify();
  }

  @override
  void didUpdateWidget(covariant AppErrorNotice oldWidget) {
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
        showAppError(context, message);
      }
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
