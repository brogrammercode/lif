import 'package:flutter/material.dart';
import 'package:user/components/ui/liquid_glass.dart';

/// A bounded glass control, without Material Chip's opaque default fill.
class LiquidGlassChip extends StatelessWidget {
  final String label;
  final IconData? icon;
  final bool? selected;
  final VoidCallback? onPressed, onDeleted;
  const LiquidGlassChip({
    super.key,
    required this.label,
    this.icon,
    this.selected,
    this.onPressed,
    this.onDeleted,
  });

  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    button: onPressed != null,
    child: LiquidGlassSurface(
      radius: 18,
      padding: EdgeInsets.zero,
      tint: selected == true ? GlassTokens.accent : null,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(18),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Padding(
            padding: EdgeInsets.fromLTRB(14, 9, onDeleted == null ? 14 : 4, 9),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (selected == true || icon != null) ...[
                  Icon(
                    selected == true ? Icons.check : icon,
                    size: 18,
                    color: GlassTokens.accent,
                  ),
                  const SizedBox(width: 8),
                ],
                Flexible(
                  child: Text(
                    label,
                    style: TextStyle(
                      color: GlassTokens.ink,
                      fontSize: 13,
                      fontWeight: selected == true
                          ? FontWeight.w600
                          : FontWeight.w500,
                    ),
                  ),
                ),
                if (onDeleted != null) ...[
                  const SizedBox(width: 4),
                  IconButton(
                    tooltip: 'Remove $label filter',
                    onPressed: onDeleted,
                    icon: const Icon(Icons.close, size: 17),
                    color: GlassTokens.accent,
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
