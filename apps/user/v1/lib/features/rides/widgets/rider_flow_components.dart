import 'package:user/components/ui/solid_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/features/rides/ride_display.dart';

/// Common map-first composition used by selection, search and live ride stages.
class RiderFlowScaffold extends StatefulWidget {
  final Widget map, panel;
  final Widget? statusStrip;
  final String title;
  final VoidCallback? onBack, onRecenter, onRefresh;
  final double? panelContentHeight;
  final double initialPanelFraction, maximumPanelFraction;
  const RiderFlowScaffold({
    super.key,
    required this.map,
    required this.panel,
    required this.title,
    this.statusStrip,
    this.onBack,
    this.onRecenter,
    this.onRefresh,
    this.panelContentHeight,
    this.initialPanelFraction = .30,
    this.maximumPanelFraction = .86,
  });
  @override
  State<RiderFlowScaffold> createState() => _RiderFlowScaffoldState();
}

class _RiderFlowScaffoldState extends State<RiderFlowScaffold> {
  double? _fraction;
  @override
  void didUpdateWidget(covariant RiderFlowScaffold oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialPanelFraction != widget.initialPanelFraction) {
      _fraction = null;
    }
  }

  @override
  Widget build(BuildContext context) => SolidScope(
    child: Scaffold(
      backgroundColor: RideTokens.canvas,
      body: LayoutBuilder(
        builder: (context, bounds) {
          final stripHeight = RideArrivalStrip.heightFor(context);
          final initial = widget.initialPanelFraction;
          const dragHandleHeight = 21.0;
          final measuredMax = widget.panelContentHeight == null
              ? widget.maximumPanelFraction
              : ((stripHeight +
                            dragHandleHeight +
                            MediaQuery.paddingOf(context).bottom +
                            widget.panelContentHeight!) /
                        bounds.maxHeight)
                    .clamp(initial, widget.maximumPanelFraction)
                    .toDouble();
          final height = bounds.maxHeight * (_fraction ?? initial);
          final header =
              widget.statusStrip ??
              RideArrivalStrip(label: widget.title, value: '');
          return Stack(
            children: [
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: bounds.maxHeight * .80,
                child: widget.map,
              ),
              Positioned(
                top: MediaQuery.paddingOf(context).top + 12,
                left: 12,
                child: SolidIconButton(
                  icon: Icons.chevron_left,
                  tooltip: 'Back',
                  onPressed: widget.onBack ?? () => Navigator.maybePop(context),
                ),
              ),
              if (widget.onRefresh != null)
                Positioned(
                  top: MediaQuery.paddingOf(context).top + 12,
                  right: 12,
                  child: SolidIconButton(
                    icon: Icons.refresh,
                    tooltip: 'Refresh ride',
                    onPressed: widget.onRefresh!,
                  ),
                ),
              if (widget.onRecenter != null)
                Positioned(
                  right: 16,
                  bottom: height + 10,
                  child: SolidIconButton(
                    icon: Icons.my_location,
                    tooltip: 'Show route',
                    onPressed: widget.onRecenter!,
                  ),
                ),
              NotificationListener<DraggableScrollableNotification>(
                onNotification: (notice) {
                  if ((_fraction ?? initial) != notice.extent) {
                    setState(() => _fraction = notice.extent);
                  }
                  return false;
                },
                child: DraggableScrollableSheet(
                  key: ValueKey(initial),
                  initialChildSize: initial,
                  minChildSize: .30,
                  maxChildSize: measuredMax,
                  builder: (context, scroll) => RideStagePanel(
                    key: const ValueKey('ride-stage-panel'),
                    header: header,
                    blackHeight: stripHeight,
                    child: SafeArea(
                      top: false,
                      child: Column(
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
                          Expanded(
                            child: PrimaryScrollController(
                              controller: scroll,
                              child: widget.panel,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    ),
  );
}

class RiderFlowHeading extends StatelessWidget {
  final String title;
  final String? subtitle;
  const RiderFlowHeading(this.title, {super.key, this.subtitle});
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: RideTokens.ink,
        ),
      ),
      if (subtitle != null) ...[
        const SizedBox(height: 6),
        Text(
          subtitle!,
          style: const TextStyle(color: RideTokens.muted, height: 1.4),
        ),
      ],
    ],
  );
}

class RideFlowImage extends StatelessWidget {
  final String? url;
  final double size;
  final IconData fallback;
  final Color iconColor;
  const RideFlowImage({
    super.key,
    this.url,
    this.size = 52,
    this.fallback = Icons.directions_car_outlined,
    this.iconColor = RideTokens.ink,
  });
  @override
  Widget build(BuildContext context) => SizedBox(
    width: size,
    height: size,
    child: url == null || url!.isEmpty
        ? Icon(fallback, size: size * .55, color: iconColor)
        : Image.network(
            url!,
            fit: BoxFit.contain,
            cacheWidth: (size * 3).round(),
            errorBuilder: (_, _, _) => Icon(fallback, color: iconColor),
          ),
  );
}

/// Identical vehicle-first / driver-second hierarchy for previews and assignment.
class RideVehicleDriverCard extends StatelessWidget {
  final Map<String, dynamic> vehicle, driver;
  final bool preview, compact;
  final Widget? contactActions;
  final String? categoryLabel, distanceLabel;
  final String? personLabel;
  final String? vehicleSubtitle;
  final Widget? personBadge;
  final bool showRating;
  const RideVehicleDriverCard({
    super.key,
    required this.vehicle,
    required this.driver,
    this.preview = false,
    this.compact = false,
    this.contactActions,
    this.categoryLabel,
    this.distanceLabel,
    this.personLabel,
    this.vehicleSubtitle,
    this.personBadge,
    this.showRating = true,
  });
  @override
  Widget build(BuildContext context) {
    final person = rideMap(driver['user']);
    final brand = rideMap(vehicle['brand']);
    final brandName = '${brand['name'] ?? vehicle['make'] ?? ''}'.trim();
    final brandLogoUrl =
        '${brand['logo_url'] ?? vehicle['brand_logo_url'] ?? ''}'.trim();
    Widget brandFallback() => Center(
      child: Text(
        brandName.isEmpty ? 'Vehicle' : brandName,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: RideTokens.ink,
        ),
      ),
    );
    final name = '${person['first_name'] ?? ''} ${person['last_name'] ?? ''}'
        .trim();
    final ratingAverage = rideNumber(driver['rating_average']);
    final rating =
        (rideNumber(driver['ratings_count']) ?? 0) > 0 && ratingAverage != null
        ? '${ratingAverage.toStringAsFixed(1)} ⭐'
        : 'New ⭐';
    final driverSubtitle =
        personLabel ??
        (preview ? (distanceLabel ?? 'Nearby driver') : 'Your driver');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!compact) ...[
          SolidSurface(
            radius: 12,
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${vehicle['plate_number'] ?? (preview ? 'Nearby vehicle' : 'Vehicle details pending')}',
                        style: const TextStyle(
                          fontSize: 20,
                          height: 1.2,
                          fontWeight: FontWeight.w700,
                          color: RideTokens.ink,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        (vehicleSubtitle != null
                                ? [vehicleSubtitle]
                                : [
                                    vehicle['make'],
                                    vehicle['model'],
                                    vehicle['color'],
                                  ])
                            .where((v) => v != null && '$v'.isNotEmpty)
                            .join(' · '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: RideTokens.ink,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 66,
                  height: 66,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Container(
                        width: 60,
                        height: 60,
                        clipBehavior: Clip.antiAlias,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: RideTokens.line.withValues(alpha: .55),
                          ),
                        ),
                        padding: const EdgeInsets.all(8),
                        child: brandLogoUrl.isNotEmpty
                            ? Image.network(
                                brandLogoUrl,
                                fit: BoxFit.contain,
                                cacheWidth: 180,
                                errorBuilder: (_, _, _) => brandFallback(),
                              )
                            : brandFallback(),
                      ),
                      if (categoryLabel != null)
                        Positioned(
                          bottom: 0,
                          right: 0,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: RideTokens.accent,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Text(
                              categoryLabel!,
                              style: const TextStyle(
                                fontSize: 10,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        SizedBox(height: 5),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SizedBox(
              width: 64,
              height: 64,
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: SizedBox(
                      width: 58,
                      height: 58,
                      child:
                          person['avatar_url'] is String &&
                              '${person['avatar_url']}'.isNotEmpty
                          ? Image.network(
                              '${person['avatar_url']}',
                              fit: BoxFit.cover,
                              cacheWidth: 162,
                              errorBuilder: (_, _, _) => const ColoredBox(
                                color: Color(0xFFF0F1F3),
                                child: Icon(Icons.person_outline),
                              ),
                            )
                          : const ColoredBox(
                              color: Color(0xFFF0F1F3),
                              child: Icon(Icons.person_outline),
                            ),
                    ),
                  ),
                  if (personBadge != null || showRating)
                    Positioned(
                      bottom: 1,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 4,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: RideTokens.line.withValues(alpha: .7),
                            ),
                          ),
                          child:
                              personBadge ??
                              Text(
                                rating,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: 10,
                                  height: 1.2,
                                  fontWeight: FontWeight.w600,
                                  color: RideTokens.ink,
                                ),
                              ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name.isEmpty
                        ? (personLabel ??
                              (preview ? 'Available driver' : 'Your driver'))
                        : name,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: RideTokens.ink,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    compact
                        ? '${vehicle['plate_number'] ?? ''}'
                        : driverSubtitle,
                    style: const TextStyle(
                      fontSize: 13,
                      color: RideTokens.muted,
                    ),
                  ),
                ],
              ),
            ),
            ?contactActions,
          ],
        ),
      ],
    );
  }
}

class RideFlowSkeleton extends StatelessWidget {
  const RideFlowSkeleton({super.key});
  @override
  Widget build(BuildContext context) => const AppSkeleton(
    label: 'Loading ride',
    child: Padding(
      padding: EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SkeletonBox(height: 24, width: 140),
          SizedBox(height: 18),
          SkeletonBox(height: 90),
          SizedBox(height: 14),
          SkeletonBox(height: 58),
        ],
      ),
    ),
  );
}

class RideArrivalStrip extends StatelessWidget {
  static double heightFor(BuildContext context) => 54;
  final String label, value;
  final VoidCallback? onValueTap;
  const RideArrivalStrip({
    super.key,
    required this.label,
    required this.value,
    this.onValueTap,
  });
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, bounds) => Row(
      children: [
        const Icon(Icons.hourglass_top, size: 17, color: Colors.white),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 14,
              height: 1.35,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(width: 8),
        ConstrainedBox(
          constraints: BoxConstraints(maxWidth: bounds.maxWidth * .42),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onValueTap,
              borderRadius: BorderRadius.circular(18),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFF333333),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    height: 1.35,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
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

/// Compact black swipe action used to leave the Home route selection stage.
class RideSwipeButton extends StatefulWidget {
  final String label;
  final bool enabled;
  final bool busy;
  final bool readOnly;
  final double? progressValue;
  final VoidCallback onSwipe;

  const RideSwipeButton({
    super.key,
    required this.enabled,
    required this.onSwipe,
    this.busy = false,
    this.readOnly = false,
    this.progressValue,
    this.label = 'Slide to continue',
  });

  @override
  State<RideSwipeButton> createState() => _RideSwipeButtonState();
}

class _RideSwipeButtonState extends State<RideSwipeButton> {
  double _progress = 0;
  double _width = 0;
  bool _completed = false;

  @override
  void didUpdateWidget(covariant RideSwipeButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.busy && !widget.busy) {
      _progress = 0;
      _completed = false;
    }
  }

  void _drag(DragUpdateDetails details) {
    if (!widget.enabled || widget.busy || _completed) return;
    setState(() {
      const thumbSize = 68.0;
      const horizontalInset = 8.0;
      final travel = _width > thumbSize + horizontalInset * 2
          ? _width - thumbSize - horizontalInset * 2
          : 1.0;
      _progress = (_progress + details.delta.dx / travel)
          .clamp(0.0, 1.0)
          .toDouble();
    });
  }

  void _finish() {
    if (!widget.enabled || widget.busy || _completed) return;
    if (_progress >= .82) {
      setState(() {
        _progress = 1;
        _completed = true;
      });
      widget.onSwipe();
    } else {
      setState(() => _progress = 0);
    }
  }

  @override
  Widget build(BuildContext context) => !widget.readOnly
      ? _RidePillSlider(
          enabled: widget.enabled,
          busy: widget.busy,
          label: widget.label,
          onSlide: widget.onSwipe,
        )
      : LayoutBuilder(
          builder: (context, constraints) {
            _width = constraints.maxWidth;
            final active = widget.enabled && !widget.busy && !widget.readOnly;
            const thumbSize = 68.0;
            const horizontalInset = 8.0;
            const trackInset = 10.0;
            final travel = _width > thumbSize + horizontalInset * 2
                ? _width - thumbSize - horizontalInset * 2
                : 1.0;
            final progress =
                widget.progressValue?.clamp(0.0, 1.0).toDouble() ?? _progress;
            final thumbLeft = horizontalInset + progress * travel;
            final trackWidth = (_width - trackInset * 2).clamp(0.0, _width);
            final trailWidth = widget.busy
                ? trackWidth
                : (thumbLeft + thumbSize / 2 - trackInset).clamp(
                    0.0,
                    trackWidth,
                  );
            final hintWidth = widget.label == 'Swipe right' ? 80.0 : 140.0;
            final hintLeft = (thumbLeft + thumbSize / 2 - hintWidth / 2)
                .clamp(0.0, (_width - hintWidth).clamp(0.0, _width))
                .toDouble();
            final showHint = active && !_completed && progress < .02;

            return Semantics(
              button: !widget.readOnly,
              enabled: active,
              label: widget.readOnly
                  ? 'Trip progress'
                  : widget.busy
                  ? 'Finding ride options'
                  : 'Swipe the car to continue to ride options',
              onTap: active ? widget.onSwipe : null,
              child: GestureDetector(
                key: const ValueKey('ride-swipe-button'),
                behavior: HitTestBehavior.opaque,
                onHorizontalDragUpdate: active ? _drag : null,
                onHorizontalDragEnd: active ? (_) => _finish() : null,
                onHorizontalDragCancel: active ? _finish : null,
                child: SizedBox(
                  height: 64,
                  child: Stack(
                    clipBehavior: Clip.none,
                    alignment: Alignment.center,
                    children: [
                      Positioned(
                        left: trackInset,
                        right: trackInset,
                        top: 28,
                        height: 12,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: const Color(0xFFECECF1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                      Positioned(
                        key: const ValueKey('ride-swipe-trail'),
                        left: trackInset,
                        top: 28,
                        width: trailWidth,
                        height: 12,
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [Colors.blue, Colors.blueAccent],
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                      Positioned(
                        left: thumbLeft,
                        top: 5,
                        bottom: 0,
                        width: thumbSize,
                        child: Opacity(
                          opacity: widget.readOnly || active || widget.busy
                              ? 1
                              : .5,
                          child: Center(
                            child: RotatedBox(
                              quarterTurns: 1,
                              child: Image.asset(
                                'assets/images/ride_car_marker.png',
                                key: const ValueKey('ride-swipe-car'),
                                width: 68,
                                height: 68,
                                fit: BoxFit.contain,
                                filterQuality: FilterQuality.medium,
                              ),
                            ),
                          ),
                        ),
                      ),
                      if (showHint)
                        Positioned(
                          key: const ValueKey('ride-swipe-hint-layer'),
                          left: hintLeft,
                          top: -6,
                          width: hintWidth,
                          child: IgnorePointer(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  alignment: Alignment.center,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 9,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: Colors.blue.withValues(alpha: .22),
                                    ),
                                    boxShadow: const [
                                      BoxShadow(
                                        color: Color(0x18000000),
                                        blurRadius: 5,
                                        offset: Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: Text(
                                    widget.label,
                                    key: ValueKey('ride-swipe-hint'),
                                    maxLines: 1,
                                    style: TextStyle(
                                      color: Colors.blue,
                                      fontSize: 10,
                                      height: 1,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                CustomPaint(
                                  size: const Size(12, 6),
                                  painter: _SwipeHintTailPainter(),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
}

/// Reference image 193: solid blue pill with a lighter chevron thumb.
class _RidePillSlider extends StatefulWidget {
  final bool enabled, busy;
  final String label;
  final VoidCallback onSlide;
  const _RidePillSlider({
    required this.enabled,
    required this.busy,
    required this.label,
    required this.onSlide,
  });
  @override
  State<_RidePillSlider> createState() => _RidePillSliderState();
}

class _RidePillSliderState extends State<_RidePillSlider> {
  double _progress = 0;
  bool _submitted = false;
  bool get _active => widget.enabled && !widget.busy && !_submitted;
  @override
  void didUpdateWidget(covariant _RidePillSlider oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.busy && !widget.busy) {
      _submitted = false;
      _progress = 0;
    }
  }

  void _submit() {
    if (!_active) return;
    setState(() {
      _progress = 1;
      _submitted = true;
    });
    widget.onSlide();
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      const thumbWidth = 58.0;
      final travel = (constraints.maxWidth - thumbWidth - 9).clamp(
        1.0,
        double.infinity,
      );
      return Semantics(
        label: widget.label,
        button: true,
        enabled: _active,
        onTap: _active ? _submit : null,
        child: GestureDetector(
          key: const ValueKey('ride-swipe-button'),
          behavior: HitTestBehavior.opaque,
          onHorizontalDragUpdate: !_active
              ? null
              : (details) => setState(
                  () => _progress = (_progress + details.delta.dx / travel)
                      .clamp(0.0, 1.0),
                ),
          onHorizontalDragEnd: !_active
              ? null
              : (_) {
                  if (_progress >= .9) {
                    _submit();
                  } else {
                    setState(() => _progress = 0);
                  }
                },
          onHorizontalDragCancel: () {
            if (!_submitted) setState(() => _progress = 0);
          },
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Opacity(
                opacity: widget.enabled || widget.busy ? 1 : .5,
                child: Container(
                  height: 52,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: const Color(0xFF4566FF),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: const Color(0xFF5664E6),
                      width: 1.5,
                    ),
                  ),
                  child: Stack(
                    children: [
                      Positioned.fill(
                        left: 64,
                        right: 10,
                        child: Center(
                          child: Opacity(
                            opacity: widget.busy
                                ? 1
                                : (1 - _progress * 1.5).clamp(0.0, 1.0),
                            child: Text(
                              widget.busy ? 'Processing…' : widget.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                height: 1.2,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 3 + _progress * travel,
                        top: 3,
                        bottom: 3,
                        child: Container(
                          width: thumbWidth,
                          decoration: BoxDecoration(
                            color: const Color(0xFF91A5FF),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Center(
                            child: CustomPaint(
                              size: Size(22, 10),
                              painter: _SlideChevrons(),
                            ),
                          ),
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
    },
  );
}

class _SlideChevrons extends CustomPainter {
  const _SlideChevrons();
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (var i = 0; i < 4; i++) {
      final x = 2.0 + i * 5;
      canvas.drawPath(
        Path()
          ..moveTo(x, 2)
          ..lineTo(x + 3, 5)
          ..lineTo(x, 8),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _SlideChevrons oldDelegate) => false;
}

class RideDestinationProgressBar extends StatelessWidget {
  final double? remainingDistance, totalDistance;

  const RideDestinationProgressBar({
    super.key,
    required this.remainingDistance,
    required this.totalDistance,
  });

  @override
  Widget build(BuildContext context) {
    final double progress =
        remainingDistance != null && totalDistance != null && totalDistance! > 0
        ? (1 - remainingDistance! / totalDistance!).clamp(0.0, 1.0).toDouble()
        : 0.0;
    final label = remainingDistance != null && totalDistance != null
        ? 'Trip progress ${(progress * 100).round()} percent, ${rideDistance(remainingDistance)} remaining to destination'
        : 'Trip progress unavailable';

    return Semantics(
      label: label,
      child: ExcludeSemantics(
        child: TweenAnimationBuilder<double>(
          tween: Tween<double>(begin: progress, end: progress),
          duration: const Duration(milliseconds: 500),
          curve: Curves.easeInOut,
          builder: (context, animatedProgress, _) => RideSwipeButton(
            enabled: false,
            busy: false,
            readOnly: true,
            progressValue: animatedProgress,
            onSwipe: () {},
          ),
        ),
      ),
    );
  }
}

class _SwipeHintTailPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final tail = Path()
      ..moveTo(1, 0)
      ..lineTo(size.width / 2, size.height)
      ..lineTo(size.width - 1, 0)
      ..close();
    canvas.drawPath(tail, Paint()..color = Colors.white);
    canvas.drawLine(
      Offset(1, 0),
      Offset(size.width / 2, size.height),
      Paint()
        ..color = Colors.blue.withValues(alpha: .22)
        ..strokeWidth = 1,
    );
    canvas.drawLine(
      Offset(size.width / 2, size.height),
      Offset(size.width - 1, 0),
      Paint()
        ..color = Colors.blue.withValues(alpha: .22)
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// The single black-header / white-content parent used by every ride stage.
class RideStagePanel extends StatelessWidget {
  final Widget header, child;
  final EdgeInsetsGeometry padding;
  final double blackHeight, radius;
  final bool fullRadius;

  const RideStagePanel({
    super.key,
    required this.header,
    required this.child,
    this.padding = EdgeInsets.zero,
    this.blackHeight = 54,
    this.radius = 18,
    this.fullRadius = true,
  });

  @override
  Widget build(BuildContext context) => SolidSurface(
    margin: EdgeInsets.symmetric(vertical: 10, horizontal: 10),
    upperChild: header,
    blackHeight: blackHeight,
    radius: radius,
    fullRadius: fullRadius,
    padding: padding,
    child: child,
  );
}

class RideContentSizeReporter extends SingleChildRenderObjectWidget {
  final ValueChanged<Size> onSizeChanged;

  const RideContentSizeReporter({
    super.key,
    required this.onSizeChanged,
    required super.child,
  });

  @override
  RenderObject createRenderObject(BuildContext context) =>
      RideContentSizeRenderObject(onSizeChanged);

  @override
  void updateRenderObject(
    BuildContext context,
    covariant RideContentSizeRenderObject renderObject,
  ) {
    renderObject.onSizeChanged = onSizeChanged;
  }
}

class RideContentSizeRenderObject extends RenderProxyBox {
  RideContentSizeRenderObject(this.onSizeChanged);

  ValueChanged<Size> onSizeChanged;
  Size? _lastReportedSize;

  @override
  void performLayout() {
    super.performLayout();
    final measuredSize = size;
    if (_lastReportedSize == measuredSize) return;
    _lastReportedSize = measuredSize;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (attached && _lastReportedSize == measuredSize) {
        onSizeChanged(measuredSize);
      }
    });
  }
}

class RideRouteTimeline extends StatelessWidget {
  final Map<String, dynamic> trip;
  const RideRouteTimeline(this.trip, {super.key});
  @override
  Widget build(BuildContext context) => Column(
    children: [
      const Divider(height: 1),
      const SizedBox(height: 16),
      IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: 20,
              child: Column(
                children: [
                  const SizedBox(height: 15),
                  const Icon(
                    Icons.radio_button_checked,
                    size: 16,
                    color: Colors.black,
                  ),
                  Expanded(
                    child: Center(
                      child: Container(
                        width: 1,
                        constraints: const BoxConstraints(minHeight: 28),
                        color: const Color(0xFFDDDDDD),
                      ),
                    ),
                  ),
                  const Icon(Icons.location_on, size: 18, color: Colors.black),
                  const SizedBox(height: 19),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Start Location',
                    style: TextStyle(fontSize: 12, color: RideTokens.muted),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${trip['pickup_address'] ?? 'Pickup unavailable'}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      height: 1.25,
                    ),
                  ),
                  const SizedBox(height: 22),
                  const Text(
                    'Your Destination',
                    style: TextStyle(fontSize: 12, color: RideTokens.muted),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${trip['dropoff_address'] ?? 'Destination unavailable'}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      height: 1.25,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class RideRouteProgress extends StatelessWidget {
  final double? remainingDistance, totalDistance;
  const RideRouteProgress({
    super.key,
    this.remainingDistance,
    this.totalDistance,
  });
  @override
  Widget build(BuildContext context) {
    final progress =
        remainingDistance != null && totalDistance != null && totalDistance! > 0
        ? (1 - remainingDistance! / totalDistance!).clamp(0.0, 1.0)
        : null;
    return SolidSurface(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            remainingDistance == null
                ? 'Waiting for a current route estimate'
                : '${rideDistance(remainingDistance)} to destination',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          if (progress != null) ...[
            const SizedBox(height: 12),
            Semantics(
              label: 'Approximate route progress',
              child: ClipRRect(
                borderRadius: BorderRadius.circular(9),
                child: SizedBox(
                  height: 8,
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: ColoredBox(
                          color: RideTokens.accent.withValues(alpha: .15),
                        ),
                      ),
                      FractionallySizedBox(
                        widthFactor: progress,
                        heightFactor: 1,
                        child: const ColoredBox(color: RideTokens.accent),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class DriverSearchRadar extends StatelessWidget {
  const DriverSearchRadar({super.key});
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Searching for an available driver',
    child: SizedBox(
      width: 128,
      height: 128,
      child: Stack(
        alignment: Alignment.center,
        children: [
          for (final size in [120.0, 88.0, 54.0])
            Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: RideTokens.accent.withValues(alpha: .035),
                border: Border.all(
                  color: RideTokens.accent.withValues(alpha: .22),
                ),
              ),
            ),
          const Icon(Icons.radar, size: 70, color: RideTokens.accent),
        ],
      ),
    ),
  );
}
