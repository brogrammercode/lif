import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/liquid_glass.dart';

/// The shared closed selector, also used for searchable catalog routes.
class LiquidGlassSelectField extends StatelessWidget {
  final InputDecoration decoration;
  final Widget? selection;
  final VoidCallback? onTap;
  final FocusNode? focusNode;
  final bool focused;
  const LiquidGlassSelectField({
    super.key,
    required this.decoration,
    required this.selection,
    required this.onTap,
    this.focusNode,
    this.focused = false,
  });

  @override
  Widget build(BuildContext context) => LiquidGlassScope(
    child: Builder(
      builder: (context) {
        final enabled = onTap != null;
        return Semantics(
          button: true,
          enabled: enabled,
          child: LiquidGlassSurface(
            padding: EdgeInsets.zero,
            radius: 20,
            child: Shortcuts(
              shortcuts: const {
                SingleActivator(LogicalKeyboardKey.arrowDown): ActivateIntent(),
              },
              child: InkWell(
                focusNode: focusNode,
                onTap: onTap,
                borderRadius: BorderRadius.circular(20),
                child: InputDecorator(
                  isEmpty: selection == null,
                  isFocused: focused,
                  decoration: decoration
                      .copyWith(
                        enabled: enabled,
                        border: GlassTokens.inputBorder,
                        enabledBorder: GlassTokens.inputBorder,
                        disabledBorder: GlassTokens.inputBorder,
                        suffixIcon: Icon(
                          Icons.keyboard_arrow_down,
                          size: 22,
                          color: enabled
                              ? GlassTokens.accent
                              : GlassTokens.muted,
                        ),
                      )
                      .applyDefaults(Theme.of(context).inputDecorationTheme),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 24),
                    child: DefaultTextStyle.merge(
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.4,
                        color: enabled ? GlassTokens.ink : GlassTokens.muted,
                      ),
                      child: selection ?? const SizedBox.shrink(),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    ),
  );
}

/// Retains Form validation/reset and original option values while replacing the
/// opaque Material dropdown route with a bounded, searchable glass popover.
class LiquidGlassDropdownFormField<T> extends FormField<T> {
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?>? onChanged;
  final InputDecoration decoration;
  final String Function(T)? searchLabel;
  final bool loading;
  LiquidGlassDropdownFormField({
    super.key,
    T? initialValue,
    required this.items,
    required this.onChanged,
    this.decoration = const InputDecoration(),
    this.searchLabel,
    this.loading = false,
    super.validator,
    super.onSaved,
    super.autovalidateMode,
  }) : super(
         initialValue: items.any((item) => item.value == initialValue)
             ? initialValue
             : null,
         enabled:
             onChanged != null && !loading && items.any((item) => item.enabled),
         builder: (state) => (state as _GlassDropdownState<T>)._build(),
       );

  @override
  FormFieldState<T> createState() => _GlassDropdownState<T>();
}

class _GlassDropdownState<T> extends FormFieldState<T> {
  final _anchor = GlobalKey();
  final _focus = FocusNode();
  bool _open = false;
  LiquidGlassDropdownFormField<T> get _field =>
      widget as LiquidGlassDropdownFormField<T>;

  @override
  void initState() {
    super.initState();
    _focus.addListener(_focusChanged);
  }

  void _focusChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant LiquidGlassDropdownFormField<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialValue != _field.initialValue) {
      setValue(_field.initialValue);
    }
    if (value != null && !_field.items.any((item) => item.value == value)) {
      setValue(null);
    }
  }

  @override
  void didChange(T? value) {
    super.didChange(value);
    _field.onChanged?.call(value);
  }

  @override
  void reset() {
    super.reset();
    _field.onChanged?.call(value);
  }

  Future<void> _show() async {
    if (_open || !_field.enabled) return;
    _open = true;
    FocusManager.instance.primaryFocus?.unfocus();
    try {
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted || !_field.enabled) return;
      final box = _anchor.currentContext?.findRenderObject();
      if (box is! RenderBox || !box.hasSize) return;
      final anchor = box.localToGlobal(Offset.zero) & box.size;
      final result = await showDialog<T>(
        context: context,
        useSafeArea: false,
        barrierColor: Colors.black.withValues(alpha: .10),
        builder: (_) => _GlassOptionMenu<T>(
          anchor: anchor,
          items: _field.items,
          selected: value,
          title:
              _field.decoration.labelText ??
              _field.decoration.hintText ??
              'Choose an option',
          searchLabel: _field.searchLabel,
        ),
      );
      if (mounted &&
          _field.enabled &&
          result != null &&
          _field.items.any((item) => item.value == result && item.enabled)) {
        didChange(result);
      }
    } finally {
      _open = false;
      if (mounted) _focus.requestFocus();
    }
  }

  Widget _build() {
    final selected = _field.items
        .where((item) => item.value == value)
        .firstOrNull;
    return KeyedSubtree(
      key: _anchor,
      child: LiquidGlassSelectField(
        decoration: _field.decoration.copyWith(
          errorText: errorText,
          helperText: _field.loading
              ? 'Loading options\u2026'
              : _field.decoration.helperText,
        ),
        selection: _field.loading
            ? const AppSkeleton(
                label: 'Loading options',
                child: SkeletonBox(width: 140, height: 16),
              )
            : selected?.child,
        onTap: _field.enabled ? _show : null,
        focusNode: _focus,
        focused: _focus.hasFocus || _open,
      ),
    );
  }
}

class _GlassOptionMenu<T> extends StatefulWidget {
  final Rect anchor;
  final List<DropdownMenuItem<T>> items;
  final T? selected;
  final String title;
  final String Function(T)? searchLabel;
  const _GlassOptionMenu({
    required this.anchor,
    required this.items,
    required this.selected,
    required this.title,
    this.searchLabel,
  });
  @override
  State<_GlassOptionMenu<T>> createState() => _GlassOptionMenuState<T>();
}

class _GlassOptionMenuState<T> extends State<_GlassOptionMenu<T>> {
  final _query = TextEditingController();
  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  String _label(DropdownMenuItem<T> item) {
    if (widget.searchLabel != null && item.value != null) {
      return widget.searchLabel!(item.value as T);
    }
    final child = item.child;
    return child is Text
        ? child.data ?? child.textSpan?.toPlainText() ?? ''
        : '';
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final search = widget.items.length >= 8;
    final query = _query.text.trim().toLowerCase();
    final items = widget.items
        .where((item) => _label(item).toLowerCase().contains(query))
        .toList();
    final top = media.padding.top + 12;
    final bottom = math.max(
      top + 1,
      media.size.height -
          math.max(media.viewInsets.bottom, media.padding.bottom) -
          12,
    );
    final width = math.min(
      math.max(widget.anchor.width, 280),
      math.min(420, media.size.width - 24),
    );
    final left = widget.anchor.left.clamp(
      12.0,
      math.max(12.0, media.size.width - width - 12),
    );
    final scale = media.textScaler.scale(14) / 14;
    final height = math.min(
      bottom - top,
      70 + (search ? 76 : 0) + math.min(widget.items.length, 6) * 60 * scale,
    );
    final below = widget.anchor.bottom + 8;
    final menuTop =
        (below + height <= bottom ? below : widget.anchor.top - height - 8)
            .clamp(top, math.max(top, bottom - height));
    return LiquidGlassScope(
      child: Stack(
        children: [
          Positioned(
            left: left.toDouble(),
            top: menuTop.toDouble(),
            width: width.toDouble(),
            height: height,
            child: Material(
              color: Colors.transparent,
              child: BackdropGroup(
                child: LiquidGlassSurface(
                  radius: 24,
                  padding: EdgeInsets.zero,
                  child: FocusTraversalGroup(
                    child: CustomScrollView(
                      shrinkWrap: true,
                      slivers: [
                        SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(16, 8, 6, 4),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Semantics(
                                    header: true,
                                    child: Text(
                                      widget.title,
                                      style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                        color: GlassTokens.ink,
                                      ),
                                    ),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Close options',
                                  onPressed: () => Navigator.pop(context),
                                  icon: const Icon(
                                    Icons.close,
                                    size: 19,
                                    color: GlassTokens.muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        if (search)
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                              child: LiquidGlassSurface(
                                padding: EdgeInsets.zero,
                                radius: 18,
                                child: TextField(
                                  controller: _query,
                                  decoration: const InputDecoration(
                                    labelText: 'Search options',
                                    prefixIcon: Icon(Icons.search, size: 20),
                                  ),
                                  onChanged: (_) => setState(() {}),
                                ),
                              ),
                            ),
                          ),
                        if (items.isEmpty)
                          const SliverToBoxAdapter(
                            child: Padding(
                              padding: EdgeInsets.all(20),
                              child: Text(
                                'No matching options',
                                style: TextStyle(color: GlassTokens.muted),
                              ),
                            ),
                          ),
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                          sliver: SliverList.builder(
                            itemCount: items.length,
                            itemBuilder: (context, index) {
                              final item = items[index];
                              final selected = item.value == widget.selected;
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Material(
                                  color: selected
                                      ? GlassTokens.accent.withValues(
                                          alpha: .10,
                                        )
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(16),
                                  child: ListTile(
                                    enabled: item.enabled,
                                    selected: selected,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    minTileHeight: 52,
                                    contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 4,
                                    ),
                                    title: DefaultTextStyle.merge(
                                      style: TextStyle(
                                        fontSize: 14,
                                        height: 1.4,
                                        color: item.enabled
                                            ? GlassTokens.ink
                                            : GlassTokens.muted,
                                      ),
                                      child: item.child,
                                    ),
                                    trailing: selected
                                        ? const Icon(
                                            Icons.check,
                                            size: 20,
                                            color: GlassTokens.accent,
                                          )
                                        : null,
                                    onTap: !item.enabled
                                        ? null
                                        : () => Navigator.pop(
                                            context,
                                            item.value,
                                          ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
