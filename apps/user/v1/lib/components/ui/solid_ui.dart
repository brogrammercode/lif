import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

abstract final class RideTokens {
  static const canvas = Colors.white;
  static const ink = Color(0xFF101010);
  static const muted = Color(0xFF858585);
  static const accent = Color(0xFF4258ED);
  static const line = Color(0xFFEEEEEE);
}

/// Captured by dialogs and sheets, including legacy shared trip controls.
class SolidTheme extends InheritedTheme {
  const SolidTheme({super.key, required super.child});
  static bool of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SolidTheme>() != null;
  @override
  bool updateShouldNotify(SolidTheme oldWidget) => false;
  @override
  Widget wrap(BuildContext context, Widget child) => SolidTheme(child: child);
}

class SolidScope extends StatelessWidget {
  final Widget child;
  const SolidScope({super.key, required this.child});
  @override
  Widget build(BuildContext context) {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: const ColorScheme.light(
        primary: RideTokens.ink,
        secondary: RideTokens.accent,
        surface: Colors.white,
      ),
    );
    return SolidTheme(
      child: Theme(
        data: base.copyWith(
          scaffoldBackgroundColor: Colors.white,
          textTheme: base.textTheme
              .apply(bodyColor: RideTokens.ink, displayColor: RideTokens.ink)
              .copyWith(
                bodyMedium: const TextStyle(
                  fontSize: 14,
                  height: 1.35,
                  fontWeight: FontWeight.w500,
                  color: RideTokens.ink,
                ),
                bodySmall: const TextStyle(
                  fontSize: 12,
                  height: 1.35,
                  fontWeight: FontWeight.w500,
                  color: RideTokens.muted,
                ),
                titleMedium: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: RideTokens.ink,
                ),
              ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: const Color(0xFFF5F5F5),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 12,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            labelStyle: const TextStyle(fontSize: 13, color: RideTokens.muted),
          ),
          outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
              foregroundColor: RideTokens.ink,
              side: const BorderSide(color: RideTokens.line),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          textButtonTheme: TextButtonThemeData(
            style: TextButton.styleFrom(foregroundColor: RideTokens.ink),
          ),
          dividerTheme: const DividerThemeData(
            color: RideTokens.line,
            thickness: 1,
          ),
          bottomSheetTheme: const BottomSheetThemeData(
            backgroundColor: Colors.transparent,
            surfaceTintColor: Colors.transparent,
          ),
        ),
        child: child,
      ),
    );
  }
}

class SolidSurface extends StatelessWidget {
  final Widget child;
  final Widget? upperChild;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final double radius;
  final bool dark;
  final Color? tint;
  final double blackHeight;
  final bool? fullRadius;

  const SolidSurface({
    super.key,
    required this.child,
    this.upperChild,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.radius = 14,
    this.dark = false,
    this.tint,
    this.blackHeight = 80,
    this.fullRadius = true,
  });

  @override
  Widget build(BuildContext context) {
    final body = Container(
      decoration: BoxDecoration(
        color: dark ? Colors.black : tint ?? Colors.white,
        borderRadius: fullRadius == true
            ? BorderRadius.circular(radius)
            : BorderRadius.only(
                topLeft: Radius.circular(radius),
                topRight: Radius.circular(radius),
              ),
        border: Border.all(color: dark ? Colors.black : RideTokens.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        type: MaterialType.transparency,
        child: Padding(padding: padding, child: child),
      ),
    );
    if (upperChild == null) {
      return Padding(padding: margin ?? EdgeInsets.zero, child: body);
    }
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: fullRadius == true
            ? BorderRadius.circular(radius)
            : BorderRadius.only(
                topLeft: Radius.circular(radius),
                topRight: Radius.circular(radius),
              ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: blackHeight,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: upperChild,
            ),
          ),
          Flexible(fit: FlexFit.loose, child: body),
        ],
      ),
    );
  }
}

class SolidIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool dark;
  const SolidIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.dark = false,
  });
  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: tooltip,
    onPressed: onPressed,
    style: IconButton.styleFrom(
      backgroundColor: dark ? Colors.black : Colors.white,
      foregroundColor: dark ? Colors.white : RideTokens.ink,
      minimumSize: const Size(44, 44),
      padding: const EdgeInsets.all(10),
    ),
    icon: Icon(icon, size: 20),
  );
}

class SolidButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final Widget? icon;
  final bool busy;
  final double minHeight;
  const SolidButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.icon,
    this.busy = false,
    this.minHeight = 48,
  });
  @override
  Widget build(BuildContext context) => FilledButton(
    onPressed: busy ? null : onPressed,
    style: FilledButton.styleFrom(
      backgroundColor: Colors.black,
      foregroundColor: Colors.white,
      disabledBackgroundColor: const Color(0xFF5A5A5A),
      minimumSize: Size(0, minHeight),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[icon!, const SizedBox(width: 8)],
        Flexible(
          child: Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
        if (busy)
          const Padding(
            padding: EdgeInsets.only(left: 10),
            child: SizedBox.square(
              dimension: 17,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            ),
          ),
      ],
    ),
  );
}

/// Text entry styled by the shared solid theme for mobile forms.
class SolidTextFormField extends StatelessWidget {
  final TextEditingController? controller;
  final String label;
  final String? hint;
  final String? Function(String?)? validator;
  final List<TextInputFormatter>? inputFormatters;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onFieldSubmitted;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onTap;
  final TextStyle? textStyle;
  final TextAlign textAlign;
  final int? minLines, maxLines, maxLength;
  final Widget? prefixIcon, suffixIcon;
  final bool enabled, alignLabelWithHint, readOnly, showLabel;

  const SolidTextFormField({
    super.key,
    this.controller,
    required this.label,
    this.hint,
    this.validator,
    this.inputFormatters,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.sentences,
    this.textInputAction,
    this.onFieldSubmitted,
    this.onChanged,
    this.onTap,
    this.textStyle,
    this.textAlign = TextAlign.start,
    this.minLines,
    this.maxLines = 1,
    this.maxLength,
    this.prefixIcon,
    this.suffixIcon,
    this.enabled = true,
    this.alignLabelWithHint = false,
    this.readOnly = false,
    this.showLabel = true,
  });

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (showLabel && label.isNotEmpty) ...[
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 6),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              height: 1.2,
              color: RideTokens.ink,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
      TextFormField(
        controller: controller,
        enabled: enabled,
        keyboardType: keyboardType,
        textCapitalization: textCapitalization,
        textInputAction: textInputAction,
        onFieldSubmitted: onFieldSubmitted,
        onChanged: onChanged,
        onTap: onTap,
        readOnly: readOnly,
        textAlign: textAlign,
        minLines: minLines,
        maxLines: maxLines,
        maxLength: maxLength,
        validator: validator,
        inputFormatters: inputFormatters,
        style:
            textStyle ??
            const TextStyle(
              fontSize: 14,
              height: 1.35,
              color: RideTokens.ink,
              fontWeight: FontWeight.w400,
            ),
        decoration: InputDecoration(
          hintText: hint,
          prefixIcon: prefixIcon,
          suffixIcon: suffixIcon,
          alignLabelWithHint: alignLabelWithHint,
          counterText: '',
          filled: true,
          fillColor: const Color(0xFFF5F5F5),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 13,
          ),
          constraints: const BoxConstraints(minHeight: 48),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: RideTokens.ink, width: 1),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFB3261E)),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFB3261E)),
          ),
          hintStyle: const TextStyle(
            fontSize: 14,
            height: 1.35,
            color: RideTokens.muted,
            fontWeight: FontWeight.w400,
          ),
        ),
      ),
    ],
  );
}

/// Dropdown entry styled by the shared solid theme for mobile forms.
class SolidDropdownFormField<T> extends FormField<T> {
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?>? onChanged;
  final String label;
  final String? hint;
  final bool showLabel, loading;

  SolidDropdownFormField({
    super.key,
    required super.initialValue,
    required this.items,
    required this.onChanged,
    required this.label,
    this.hint,
    this.showLabel = true,
    this.loading = false,
    super.validator,
    super.enabled = true,
  }) : super(
         builder: (field) => _SolidDropdownFieldBody<T>(
           state: field,
           items: items,
           onChanged: onChanged,
           label: label,
           hint: hint,
           showLabel: showLabel,
           loading: loading,
           enabled: field.widget.enabled,
         ),
       );
}

class _SolidDropdownFieldBody<T> extends StatelessWidget {
  final FormFieldState<T> state;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?>? onChanged;
  final String label;
  final String? hint;
  final bool showLabel, loading, enabled;

  const _SolidDropdownFieldBody({
    required this.state,
    required this.items,
    required this.onChanged,
    required this.label,
    required this.hint,
    required this.showLabel,
    required this.loading,
    required this.enabled,
  });

  String _itemLabel(DropdownMenuItem<T> item) =>
      item.child is Text ? (item.child as Text).data ?? '' : '';

  @override
  Widget build(BuildContext context) {
    final matchingItems = items
        .where((item) => item.value == state.value)
        .toList(growable: false);
    final selectedLabel = matchingItems.isEmpty
        ? null
        : _itemLabel(matchingItems.first);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showLabel && label.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 2, bottom: 6),
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                height: 1.2,
                color: RideTokens.ink,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        Material(
          color: const Color(0xFFF5F5F5),
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: !enabled || onChanged == null || loading
                ? null
                : () async {
                    final value = await showModalBottomSheet<T>(
                      context: context,
                      isScrollControlled: true,
                      backgroundColor: Colors.transparent,
                      builder: (_) => _SolidOptionSheet<T>(
                        label: label,
                        items: items,
                        selectedValue: state.value,
                        itemLabel: _itemLabel,
                      ),
                    );
                    if (value != null) {
                      state.didChange(value);
                      onChanged?.call(value);
                    }
                  },
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      selectedLabel ?? hint ?? 'Choose an option',
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.35,
                        color: selectedLabel == null
                            ? RideTokens.muted
                            : RideTokens.ink,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  ),
                  if (loading)
                    const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else
                    const Icon(Icons.keyboard_arrow_down_rounded, size: 20),
                ],
              ),
            ),
          ),
        ),
        if (state.errorText != null)
          Padding(
            padding: const EdgeInsets.only(left: 12, top: 5),
            child: Text(
              state.errorText!,
              style: const TextStyle(fontSize: 12, color: Color(0xFFB3261E)),
            ),
          ),
      ],
    );
  }
}

class _SolidOptionSheet<T> extends StatefulWidget {
  final String label;
  final List<DropdownMenuItem<T>> items;
  final T? selectedValue;
  final String Function(DropdownMenuItem<T>) itemLabel;

  const _SolidOptionSheet({
    required this.label,
    required this.items,
    required this.selectedValue,
    required this.itemLabel,
  });

  @override
  State<_SolidOptionSheet<T>> createState() => _SolidOptionSheetState<T>();
}

class _SolidOptionSheetState<T> extends State<_SolidOptionSheet<T>> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final filtered = widget.items
        .where(
          (item) => widget
              .itemLabel(item)
              .toLowerCase()
              .contains(_query.toLowerCase().trim()),
        )
        .toList(growable: false);
    return SolidSheet(
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * .72,
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    widget.label,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: RideTokens.ink,
                    ),
                  ),
                ),
                if (widget.items.length > 8) ...[
                  TextField(
                    onChanged: (value) => setState(() => _query = value),
                    style: const TextStyle(fontSize: 14),
                    decoration: InputDecoration(
                      hintText: 'Search options',
                      prefixIcon: const Icon(Icons.search_rounded, size: 20),
                      filled: true,
                      fillColor: const Color(0xFFF5F5F5),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                Flexible(
                  child: filtered.isEmpty
                      ? const Padding(
                          padding: EdgeInsets.symmetric(vertical: 18),
                          child: Text(
                            'No matching options',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: RideTokens.muted),
                          ),
                        )
                      : ListView.builder(
                          shrinkWrap: true,
                          itemCount: filtered.length,
                          itemBuilder: (context, index) {
                            final item = filtered[index];
                            final selected = item.value == widget.selectedValue;
                            return ListTile(
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 10,
                              ),
                              title: Text(
                                widget.itemLabel(item),
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w400,
                                ),
                              ),
                              trailing: selected
                                  ? const Icon(Icons.check_rounded, size: 19)
                                  : null,
                              enabled: item.enabled,
                              onTap: item.enabled
                                  ? () => Navigator.pop(context, item.value)
                                  : null,
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SolidSheet extends StatelessWidget {
  final Widget child;
  const SolidSheet({super.key, required this.child});
  @override
  Widget build(BuildContext context) => SolidScope(
    child: Material(
      color: Colors.white,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 3,
            margin: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: const Color(0xFFCCCCCC),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Flexible(fit: FlexFit.loose, child: child),
        ],
      ),
    ),
  );
}

class SolidSheetAction<T> {
  final T value;
  final String label;
  final IconData icon;
  final bool destructive;
  const SolidSheetAction({
    required this.value,
    required this.label,
    required this.icon,
    this.destructive = false,
  });
}

Future<T?> showSolidActionSheet<T>({
  required BuildContext context,
  required String title,
  required List<SolidSheetAction<T>> actions,
}) => showModalBottomSheet<T>(
  context: context,
  isScrollControlled: true,
  backgroundColor: Colors.transparent,
  builder: (sheetContext) => SolidSheet(
    child: SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 4, 18, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: RideTokens.ink,
                ),
              ),
            ),
            for (final action in actions)
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                minLeadingWidth: 36,
                leading: Icon(
                  action.icon,
                  color: action.destructive
                      ? const Color(0xFFB3261E)
                      : RideTokens.ink,
                ),
                title: Text(
                  action.label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: action.destructive
                        ? const Color(0xFFB3261E)
                        : RideTokens.ink,
                  ),
                ),
                onTap: () => Navigator.pop(sheetContext, action.value),
              ),
          ],
        ),
      ),
    ),
  ),
);

/// Shared account/content page frame, matching the Profile reference.
class SolidPage extends StatelessWidget {
  final String title;
  final Widget child;
  final Widget? action;
  final Color bodyColor;
  final VoidCallback? onBack;
  final bool resizeToAvoidBottomInset;
  const SolidPage({
    super.key,
    required this.title,
    required this.child,
    this.action,
    this.bodyColor = Colors.white,
    this.onBack,
    this.resizeToAvoidBottomInset = true,
  });
  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: SystemUiOverlayStyle(
      statusBarColor: Colors.black,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemStatusBarContrastEnforced: false,
      systemNavigationBarColor: bodyColor,
      systemNavigationBarIconBrightness: bodyColor.computeLuminance() > 0.5
          ? Brightness.dark
          : Brightness.light,
      systemNavigationBarDividerColor: bodyColor,
      systemNavigationBarContrastEnforced: false,
    ),
    child: SolidScope(
      child: Scaffold(
        backgroundColor: Colors.black,
        resizeToAvoidBottomInset: resizeToAvoidBottomInset,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 12),
                child: IconTheme(
                  data: const IconThemeData(color: Colors.white, size: 24),
                  child: Theme(
                    data: Theme.of(context).copyWith(
                      iconButtonTheme: IconButtonThemeData(
                        style: IconButton.styleFrom(
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                    child: SizedBox(
                      height: 48,
                      child: NavigationToolbar(
                        centerMiddle: true,
                        leading: IconButton(
                          tooltip: 'Back',
                          color: Colors.white,
                          icon: const Icon(Icons.chevron_left),
                          onPressed:
                              onBack ?? () => Navigator.maybePop(context),
                        ),
                        middle: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                            color: Colors.white,
                          ),
                        ),
                        trailing: action ?? const SizedBox(width: 48),
                      ),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Container(
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: bodyColor,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(24),
                    ),
                  ),
                  child: SafeArea(top: false, child: child),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
