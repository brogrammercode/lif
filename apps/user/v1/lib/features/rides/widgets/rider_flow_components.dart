import 'package:user/components/ui/solid_ui.dart';
import 'package:flutter/material.dart';

import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/features/rides/ride_display.dart';

/// Common map-first composition used by selection, search and live ride stages.
class RiderFlowScaffold extends StatefulWidget {
  final Widget map, panel;
  final Widget? statusStrip;
  final String title;
  final VoidCallback? onBack, onRecenter, onRefresh;
  final double panelFraction;
  const RiderFlowScaffold({
    super.key,
    required this.map,
    required this.panel,
    required this.title,
    this.statusStrip,
    this.onBack,
    this.onRecenter,
    this.onRefresh,
    this.panelFraction = .48,
  });
  @override
  State<RiderFlowScaffold> createState() => _RiderFlowScaffoldState();
}

class _RiderFlowScaffoldState extends State<RiderFlowScaffold> {
  double? _fraction;
  @override
  void didUpdateWidget(covariant RiderFlowScaffold oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.panelFraction != widget.panelFraction) _fraction = null;
  }

  @override
  Widget build(BuildContext context) => SolidScope(
    child: Scaffold(
      backgroundColor: RideTokens.canvas,
      body: LayoutBuilder(
        builder: (context, bounds) {
          final compact =
              bounds.maxHeight < 600 ||
              MediaQuery.textScalerOf(context).scale(1) > 1.4;
          final initial = compact ? .62 : widget.panelFraction;
          final height = bounds.maxHeight * (_fraction ?? initial);
          return Stack(
            children: [
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                bottom: widget.statusStrip == null ? height - 12 : height + 36,
                child: widget.map,
              ),
              Positioned(
                top: MediaQuery.paddingOf(context).top + 14,
                left: 50,
                right: 50,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 11,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(28),
                  ),
                  child: Text(
                    widget.title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 14,
                      height: 1.25,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              Positioned(
                top: MediaQuery.paddingOf(context).top + 65,
                left: 12,
                child: SolidIconButton(
                  icon: Icons.chevron_left,
                  tooltip: 'Back',
                  onPressed: widget.onBack ?? () => Navigator.maybePop(context),
                ),
              ),
              if (widget.onRefresh != null)
                Positioned(
                  top: MediaQuery.paddingOf(context).top + 65,
                  right: 12,
                  child: SolidIconButton(
                    icon: Icons.refresh,
                    tooltip: 'Refresh ride',
                    onPressed: widget.onRefresh!,
                  ),
                ),
              if (widget.statusStrip != null)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: height - 1,
                  child: Container(
                    height: 54,
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    decoration: const BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(16),
                      ),
                    ),
                    child: widget.statusStrip,
                  ),
                ),
              if (widget.onRecenter != null)
                Positioned(
                  right: 16,
                  bottom: height + (widget.statusStrip == null ? 8 : 64),
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
                  maxChildSize: .86,
                  builder: (context, scroll) => SolidSheet(
                    child: SafeArea(
                      top: false,
                      child: PrimaryScrollController(
                        controller: scroll,
                        child: widget.panel,
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
    child: ClipRRect(
      borderRadius: BorderRadius.circular(size / 3),
      child: url == null || url!.isEmpty
          ? Icon(fallback, size: size * .55, color: iconColor)
          : Image.network(
              url!,
              fit: BoxFit.cover,
              cacheWidth: (size * 3).round(),
              errorBuilder: (_, _, _) => Icon(fallback, color: iconColor),
            ),
    ),
  );
}

/// Identical vehicle-first / driver-second hierarchy for previews and assignment.
class RideVehicleDriverCard extends StatelessWidget {
  final Map<String, dynamic> vehicle, driver;
  final bool preview, compact;
  final Widget? contactActions;
  final String? categoryLabel;
  const RideVehicleDriverCard({
    super.key,
    required this.vehicle,
    required this.driver,
    this.preview = false,
    this.compact = false,
    this.contactActions,
    this.categoryLabel,
  });
  @override
  Widget build(BuildContext context) {
    final person = rideMap(driver['user']);
    final name = '${person['first_name'] ?? ''} ${person['last_name'] ?? ''}'
        .trim();
    final rating = (rideNumber(driver['ratings_count']) ?? 0) > 0
        ? '${driver['rating_average']} ★'
        : 'Unrated';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
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
                        [vehicle['make'], vehicle['model'], vehicle['color']]
                            .where((v) => v != null && '$v'.isNotEmpty)
                            .join(' · '),
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
                  width: 108,
                  height: 66,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Positioned.fill(
                        child: vehicle['photo_url'] is String
                            ? Image.network(
                                vehicle['photo_url'],
                                fit: BoxFit.contain,
                                cacheWidth: 324,
                                errorBuilder: (_, _, _) => const Icon(
                                  Icons.directions_car_outlined,
                                  size: 52,
                                ),
                              )
                            : const Icon(
                                Icons.directions_car_outlined,
                                size: 52,
                              ),
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
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SizedBox(
              width: 52,
              height: 62,
              child: Stack(
                children: [
                  RideFlowImage(
                    url: person['avatar_url'] as String?,
                    size: 48,
                    fallback: Icons.person_outline,
                  ),
                  Positioned(
                    bottom: 0,
                    left: 0,
                    right: 0,
                    child: Container(
                      color: Colors.white,
                      child: Text(
                        rating,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 11,
                          color: RideTokens.ink,
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
                        ? (preview ? 'Available driver' : 'Your driver')
                        : name,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: RideTokens.ink,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    compact
                        ? '${vehicle['plate_number'] ?? ''}'
                        : preview
                        ? 'Nearby · not assigned yet'
                        : (rideNumber(driver['ratings_count']) ?? 0) > 0
                        ? '${driver['ratings_count']} driver ratings'
                        : 'Your assigned driver',
                    style: const TextStyle(
                      fontSize: 12,
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
  final String label, value;
  const RideArrivalStrip({super.key, required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Row(
    children: [
      const Icon(Icons.hourglass_top, size: 17, color: Colors.white),
      const SizedBox(width: 8),
      Expanded(
        child: Text(
          label,
          style: const TextStyle(fontSize: 14, color: Colors.white),
        ),
      ),
      const SizedBox(width: 8),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: const Color(0xFF333333),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Text(
          value,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
    ],
  );
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
