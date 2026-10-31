import 'package:flutter/material.dart';
import 'package:user/components/ui/liquid_glass.dart';

/// Guidance follows editing focus. Errors and review decisions remain outside
/// this widget so they never disappear when the keyboard is dismissed.
class FocusFieldHint extends StatefulWidget {
  final Widget child;
  final String hint;
  final bool enabled;
  const FocusFieldHint({
    super.key,
    required this.child,
    required this.hint,
    this.enabled = true,
  });
  @override
  State<FocusFieldHint> createState() => _FocusFieldHintState();
}

class _FocusFieldHintState extends State<FocusFieldHint> {
  bool _focused = false;
  @override
  Widget build(BuildContext context) => Focus(
    canRequestFocus: false,
    skipTraversal: true,
    onFocusChange: (focused) => setState(() => _focused = focused),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        widget.child,
        if (widget.enabled && _focused && widget.hint.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              widget.hint,
              style: const TextStyle(
                fontSize: 12,
                height: 1.5,
                color: GlassTokens.muted,
              ),
            ),
          ),
      ],
    ),
  );
}
