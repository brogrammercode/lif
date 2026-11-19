import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import 'package:user/core/routes.dart';

/// Shared pre-request stage used by the live driver account and the UI demo.
class DriverGoOnlineStage extends StatefulWidget {
  final List<Map<String, dynamic>> vehicles;
  final String? selectedVehicleId;
  final bool loading, busy, canGoOnline, isOnline;
  final String? error;
  final ValueListenable<Position?> position;
  final ValueChanged<String> onSelectVehicle;
  final VoidCallback onGoOnline;
  final VoidCallback? onGoOffline, onProfile;
  final String? avatarUrl;
  final VoidCallback? onRetry;
  final Widget Function(Widget)? mapBuilder;

  const DriverGoOnlineStage({
    super.key,
    required this.vehicles,
    required this.selectedVehicleId,
    required this.loading,
    required this.busy,
    required this.canGoOnline,
    this.isOnline = false,
    required this.position,
    required this.onSelectVehicle,
    required this.onGoOnline,
    this.onGoOffline,
    this.avatarUrl,
    this.onProfile,
    this.onRetry,
    this.error,
    this.mapBuilder,
  });

  @override
  State<DriverGoOnlineStage> createState() => _DriverGoOnlineStageState();
}

class _DriverGoOnlineStageState extends State<DriverGoOnlineStage> {
  late final PageController _carousel = PageController(viewportFraction: .38);
  double? _contentHeight;
  bool _follow = false;
  String? _visibleSelectedVehicleId;

  @override
  void initState() {
    super.initState();
    _visibleSelectedVehicleId = widget.selectedVehicleId;
  }

  int get _selectedIndex {
    final index = widget.vehicles.indexWhere(
      (vehicle) => vehicle['id'] == widget.selectedVehicleId,
    );
    return index < 0 ? 0 : index;
  }

  @override
  void didUpdateWidget(covariant DriverGoOnlineStage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.vehicles.length != widget.vehicles.length ||
        oldWidget.selectedVehicleId != widget.selectedVehicleId) {
      _visibleSelectedVehicleId = widget.selectedVehicleId;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _carousel.hasClients && widget.vehicles.isNotEmpty) {
          _carousel.animateToPage(
            _selectedIndex,
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  @override
  void dispose() {
    _carousel.dispose();
    super.dispose();
  }

  Map<String, dynamic> _brand(Map<String, dynamic> vehicle) {
    final direct = rideMap(vehicle['brand']);
    if (direct.isNotEmpty) return direct;
    return rideMap(rideMap(vehicle['catalog_model'])['brand']);
  }

  Widget _vehicleTile(Map<String, dynamic> vehicle, int index) =>
      GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.isOnline
            ? null
            : () {
                _carousel.animateToPage(
                  index,
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                );
                final id = '${vehicle['id']}';
                setState(() => _visibleSelectedVehicleId = id);
                widget.onSelectVehicle(id);
              },
        child: _vehicleContent(vehicle),
      );

  Widget _vehicleContent(Map<String, dynamic> vehicle) {
    final selected = vehicle['id'] == _visibleSelectedVehicleId;
    final eligible = vehicle['is_eligible'] == true;
    final logo = '${_brand(vehicle)['logo_url'] ?? ''}';
    return AnimatedScale(
      scale: selected ? 1 : .88,
      duration: const Duration(milliseconds: 160),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 92,
            height: 92,
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white,
              border: Border.all(
                color: selected ? RideTokens.accent : RideTokens.line,
                width: selected ? 2.5 : 1,
              ),
              boxShadow: selected
                  ? const [
                      BoxShadow(
                        color: Color(0x164258ED),
                        blurRadius: 12,
                        offset: Offset(0, 4),
                      ),
                    ]
                  : null,
            ),
            child: ClipOval(
              child: logo.isNotEmpty
                  ? Image.network(
                      logo,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.directions_car_filled_rounded,
                        size: 38,
                        color: RideTokens.ink,
                      ),
                    )
                  : const Icon(
                      Icons.directions_car_filled_rounded,
                      size: 38,
                      color: RideTokens.ink,
                    ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _brand(vehicle)['name']?.toString() ??
                vehicle['make']?.toString() ??
                'Vehicle',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: selected ? RideTokens.ink : RideTokens.muted,
              fontSize: 13,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            eligible ? '${vehicle['model'] ?? ''}' : 'Not ready',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11, color: RideTokens.muted),
          ),
        ],
      ),
    );
  }

  Widget _panel() => SingleChildScrollView(
    child: RideContentSizeReporter(
      onSizeChanged: (size) {
        if (mounted &&
            (_contentHeight == null ||
                (_contentHeight! - size.height).abs() > 1)) {
          setState(() => _contentHeight = size.height);
        }
      },
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.isOnline ? 'You are online' : 'Choose your vehicle',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            Text(
              widget.isOnline
                  ? 'Your selected vehicle is ready for nearby ride requests.'
                  : 'Select the car you will use for your rides.',
              style: TextStyle(fontSize: 13, color: RideTokens.muted),
            ),
            const SizedBox(height: 18),
            if (widget.loading && widget.vehicles.isEmpty)
              const SizedBox(
                height: 142,
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              )
            else if (widget.vehicles.isEmpty)
              SizedBox(
                height: 142,
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.error ?? 'No registered vehicles are available.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: RideTokens.muted),
                      ),
                      if (widget.error != null && widget.onRetry != null)
                        TextButton(
                          onPressed: widget.onRetry,
                          child: const Text('Retry'),
                        ),
                    ],
                  ),
                ),
              )
            else
              SizedBox(
                height: 146,
                child: PageView.builder(
                  controller: _carousel,
                  physics: widget.isOnline
                      ? const NeverScrollableScrollPhysics()
                      : null,
                  itemCount: widget.vehicles.length,
                  onPageChanged: (index) {
                    final id = '${widget.vehicles[index]['id']}';
                    setState(() => _visibleSelectedVehicleId = id);
                    if (!widget.isOnline) widget.onSelectVehicle(id);
                  },
                  itemBuilder: (context, index) =>
                      _vehicleTile(widget.vehicles[index], index),
                ),
              ),
            if (widget.error != null && widget.vehicles.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                widget.error!,
                style: const TextStyle(fontSize: 12, color: Colors.red),
              ),
            ],
            if (!widget.canGoOnline && !widget.loading && !widget.isOnline) ...[
              const SizedBox(height: 8),
              const Text(
                'Choose a verified vehicle to go online.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: RideTokens.muted),
              ),
            ],
            const SizedBox(height: 18),
            RideSwipeButton(
              label: widget.isOnline
                  ? 'Slide to go offline'
                  : 'Slide to go online',
              accent: widget.isOnline
                  ? const Color(0xFFE53935)
                  : RideTokens.accent,
              trackColor: widget.isOnline ? const Color(0xFFFFE6E6) : null,
              thumbColor: widget.isOnline ? const Color(0xFFE53935) : null,
              labelColor: widget.isOnline ? const Color(0xFFB42318) : null,
              enabled:
                  widget.isOnline || (widget.canGoOnline && !widget.loading),
              busy: widget.busy,
              onSwipe: widget.isOnline
                  ? (widget.onGoOffline ?? () {})
                  : widget.onGoOnline,
            ),
          ],
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<Position?>(
    valueListenable: widget.position,
    builder: (context, position, _) {
      final map = DriverMap(
        location: position == null
            ? null
            : ridePoint(position.latitude, position.longitude),
        heading: position?.heading ?? 0,
        follow: _follow,
      );
      return RiderFlowScaffold(
        title: 'Go online',
        statusStrip: RideArrivalStrip(
          label: 'Go online',
          value: widget.isOnline ? 'Online' : 'Choose vehicle',
        ),
        map: widget.mapBuilder?.call(map) ?? map,
        panel: _panel(),
        panelContentHeight: _contentHeight,
        initialPanelFraction: .50,
        maximumPanelFraction: .82,
        showBackButton: false,
        fitPanelToContent: true,
        topLeading: GestureDetector(
          onTap: widget.onProfile,
          child: Container(
            width: 48,
            height: 48,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Color(0x1A000000),
                  blurRadius: 12,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: widget.avatarUrl == null || widget.avatarUrl!.isEmpty
                ? const Icon(
                    Icons.person_outline_rounded,
                    size: 25,
                    color: RideTokens.ink,
                  )
                : Image.network(
                    widget.avatarUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const Icon(
                      Icons.person_outline_rounded,
                      size: 25,
                      color: RideTokens.ink,
                    ),
                  ),
          ),
        ),
        topTrailing: SolidIconButton(
          icon: Icons.notifications_none_rounded,
          tooltip: 'Notifications',
          onPressed: () =>
              Navigator.pushNamed(context, AppRoutes.notifications),
        ),
        onRecenter: () => setState(() => _follow = true),
      );
    },
  );
}
