import 'dart:math' as math;

import 'package:user/components/ui/solid_ui.dart';
import 'package:flutter/material.dart';

import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/ride_fare_summary.dart';
import 'package:user/features/rides/widgets/ride_glass.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import 'package:video_player/video_player.dart';

/// Reference search / approach / ongoing layouts share one data-bound panel.
class RiderLivePanel extends StatelessWidget {
  final Map<String, dynamic> data;
  final String elapsed, waiting, estimate;
  final Widget actions;
  final Widget? contactActions;
  final VoidCallback onCancel, onSafety, onRefresh;
  final String? error;
  final bool busy, locationFresh;
  final double? remainingDistance;
  final ValueChanged<double>? onContentHeightChanged;
  final VoidCallback? onShowTripQr;
  const RiderLivePanel({
    super.key,
    required this.data,
    required this.elapsed,
    required this.waiting,
    required this.estimate,
    required this.actions,
    this.contactActions,
    required this.onCancel,
    required this.onSafety,
    required this.onRefresh,
    this.error,
    required this.busy,
    required this.locationFresh,
    this.remainingDistance,
    this.onContentHeightChanged,
    this.onShowTripQr,
  });
  @override
  Widget build(BuildContext context) {
    final status = '${data['status']}', trip = rideMap(data['trip']);
    final searching = ['SEARCHING', 'REQUESTED'].contains(status);
    final waiting = status == 'DRIVER_WAITING';
    final arriving = ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING'].contains(status);
    final arrivalLayout = arriving || waiting;
    final moving = status == 'IN_PROGRESS';
    final start = rideMap(data['start']);
    final riderConfirmed = start['rider_confirmed'] == true;
    final arrivalContacts = waiting
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ?contactActions,
              const SizedBox(width: 4),
              SolidIconButton(
                dark: true,
                icon: Icons.qr_code_2_rounded,
                tooltip: riderConfirmed
                    ? 'Show trip QR code'
                    : 'Confirm pickup and show trip QR code',
                onPressed: busy ? null : onShowTripQr,
              ),
            ],
          )
        : contactActions;
    final children = <Widget>[
      if (error != null && !searching) ...[
        Text(
          'Connection update failed: $error',
          style: const TextStyle(color: Colors.red),
        ),
        TextButton(onPressed: onRefresh, child: const Text('Retry update')),
      ],
      if (searching) ...[
        const SizedBox(height: 34),
        const MutedDriverSearchAnimation(),
        const SizedBox(height: 34),
        const Text(
          'Searching nearby driver',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w500,
            color: RideTokens.ink,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          data['search_radius_km'] == null
              ? 'Search area expanding'
              : 'Search area · ${data['search_radius_km']} km',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 13, color: RideTokens.muted),
        ),
        const SizedBox(height: 18),
        SizedBox(
          width: double.infinity,
          height: 60,
          child: OutlinedButton(
            onPressed: busy ? null : onCancel,
            style: OutlinedButton.styleFrom(
              foregroundColor: RideTokens.ink,
              side: const BorderSide(color: RideTokens.line),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              textStyle: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w500,
              ),
            ),
            child: const Text('Cancel'),
          ),
        ),
      ] else if (arrivalLayout) ...[
        if (!locationFresh)
          const Padding(
            padding: EdgeInsets.only(bottom: 10),
            child: Text(
              'Last known driver location. Waiting for a fresh update.',
              style: TextStyle(color: RideTokens.muted),
            ),
          ),
        RideVehicleDriverCard(
          compact: false,
          contactActions: arrivalContacts,
          categoryLabel: null,
          vehicle: rideMap(trip['vehicle']),
          driver: rideMap(trip['driver']),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 16),
          child: RideRouteTimeline(trip),
        ),
      ] else ...[
        if (!locationFresh)
          const Padding(
            padding: EdgeInsets.only(bottom: 10),
            child: Text(
              'Last known driver location. Waiting for a fresh update.',
              style: TextStyle(color: RideTokens.muted),
            ),
          ),
        RideVehicleDriverCard(
          compact: moving,
          contactActions: contactActions,
          categoryLabel: rideMap(trip['quote'])['category_snapshot'] is Map
              ? '${rideMap(rideMap(trip['quote'])['category_snapshot'])['name'] ?? ''}'
              : null,
          vehicle: rideMap(trip['vehicle']),
          driver: rideMap(trip['driver']),
        ),
        const SizedBox(height: 12),
        if (moving)
          RideDestinationProgressBar(
            remainingDistance: remainingDistance,
            totalDistance: rideNumber(trip['estimated_distance_m']),
          )
        else ...[
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: RideRouteTimeline(trip),
          ),
          const SizedBox(height: 12),
          if (status == 'DRIVER_WAITING')
            actions
          else
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Trip actions', style: TextStyle(fontSize: 13)),
              children: [actions],
            ),
        ],
      ],
      if (!searching && !arrivalLayout && !moving) ...[
        const SizedBox(height: 12),
        TextButton.icon(
          onPressed: onSafety,
          icon: const Icon(Icons.health_and_safety_outlined),
          label: const Text('Safety, sharing & trip support'),
        ),
      ],
    ];

    if (searching || arrivalLayout || moving) {
      final primaryController = PrimaryScrollController.maybeOf(context);
      return SingleChildScrollView(
        controller: primaryController,
        primary: primaryController == null,
        child: RideContentSizeReporter(
          key: ValueKey(status),
          onSizeChanged: (size) => onContentHeightChanged?.call(size.height),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: children,
            ),
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
      children: children,
    );
  }
}

class MutedDriverSearchAnimation extends StatefulWidget {
  const MutedDriverSearchAnimation({super.key});

  @override
  State<MutedDriverSearchAnimation> createState() =>
      _MutedDriverSearchAnimationState();
}

class _MutedDriverSearchAnimationState extends State<MutedDriverSearchAnimation>
    with WidgetsBindingObserver {
  late final VideoPlayerController _video = VideoPlayerController.asset(
    'assets/videos/driver_search_animation.mp4',
  );
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  Future<void> _start() async {
    try {
      await _video.initialize();
      await _video.setVolume(0);
      await _video.setLooping(true);
      if (!mounted) return;
      setState(() => _ready = true);
      await _video.play();
    } catch (_) {
      // Keep ride search usable if a platform video decoder is unavailable.
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_ready) return;
    if (state == AppLifecycleState.resumed) {
      _video.play();
    } else {
      _video.pause();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _video.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready || !_video.value.isInitialized) {
      return const SizedBox(height: 115);
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final aspectRatio = _video.value.aspectRatio;
        final maxWidth = math.min(constraints.maxWidth * .62, 220.0);
        final height = math.min(maxWidth / aspectRatio, 115.0);
        final width = height * aspectRatio;
        return Center(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(
              width: width,
              height: height,
              child: VideoPlayer(_video),
            ),
          ),
        );
      },
    );
  }
}

class RiderCompletionPanel extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function(int, String) onRate;
  final VoidCallback onHome, onReceipt;
  final Widget actions;
  final bool busy;
  final ScrollController? scrollController;
  final GlobalKey? captureKey;
  const RiderCompletionPanel({
    super.key,
    required this.data,
    required this.onRate,
    required this.onHome,
    required this.onReceipt,
    required this.actions,
    required this.busy,
    this.scrollController,
    this.captureKey,
  });
  @override
  State<RiderCompletionPanel> createState() => _CompletionState();
}

class _CompletionState extends State<RiderCompletionPanel> {
  bool _reminder = true;
  int _score = 0;
  final _comment = TextEditingController();
  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final trip = rideMap(widget.data['trip']),
        vehicle = rideMap(trip['vehicle']),
        driver = rideMap(trip['driver']);
    final user = rideMap(driver['user']);
    final payment = rideMap(widget.data['payment']);
    final method =
        '${payment['method'] ?? payment['collection_method'] ?? trip['collection_preference'] ?? 'Not recorded'}';
    final brand = rideMap(vehicle['brand']);
    final brandLogo = '${brand['logo_url'] ?? vehicle['brand_logo_url'] ?? ''}'
        .trim();
    final paid = ['PAID', 'CAPTURED'].contains(payment['status']);
    final content = <Widget>[
      if (_reminder)
        Container(
          decoration: BoxDecoration(
            color: RideTokens.accent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              const Expanded(
                child: Padding(
                  padding: EdgeInsets.only(left: 14),
                  child: Text(
                    'Make sure your belongings are not left behind 👀',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Dismiss reminder',
                onPressed: () => setState(() => _reminder = false),
                color: Colors.white,
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ),
      const SizedBox(height: 22),
      Center(
        child: SizedBox(
          height: 115,
          width: 118,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 82,
                height: 82,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white,
                  border: Border.all(color: RideTokens.line),
                ),
                child: brandLogo.isEmpty
                    ? const Icon(Icons.directions_car_outlined, size: 44)
                    : Image.network(
                        brandLogo,
                        fit: BoxFit.contain,
                        errorBuilder: (_, _, _) =>
                            const Icon(Icons.directions_car_outlined, size: 44),
                      ),
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: SolidSurface(
                  radius: 99,
                  padding: const EdgeInsets.all(4),
                  child: ClipOval(
                    child: SizedBox(
                      width: 44,
                      height: 44,
                      child:
                          user['avatar_url'] == null ||
                              '${user['avatar_url']}'.isEmpty
                          ? const Icon(
                              Icons.person_outline,
                              color: RideTokens.ink,
                            )
                          : Image.network(
                              '${user['avatar_url']}',
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => const Icon(
                                Icons.person_outline,
                                color: RideTokens.ink,
                              ),
                            ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 12),
      Text(
        '${user['first_name'] ?? ''} ${user['last_name'] ?? ''}'.trim(),
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
      ),
      Text(
        [
          vehicle['make'],
          vehicle['model'],
          vehicle['plate_number'],
        ].where((v) => v != null).join(' · '),
        textAlign: TextAlign.center,
        style: const TextStyle(color: RideTokens.muted),
      ),
      const SizedBox(height: 18),
      RideFact('Trip completed', rideReference(trip['id'])),
      RideFact('Date', rideTime(trip['completed_at'])),
      const SizedBox(height: 20),
      if (trip['review'] == null && driver['user_id'] != null) ...[
        const Text(
          'How was your trip?',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        Wrap(
          alignment: WrapAlignment.center,
          children: [
            for (int i = 1; i <= 5; i++)
              IconButton(
                tooltip: 'Rate $i stars',
                onPressed: widget.busy
                    ? null
                    : () => setState(() => _score = i),
                icon: Icon(
                  i <= _score ? Icons.star_rounded : Icons.star_outline_rounded,
                  color: RideTokens.accent,
                  size: 32,
                ),
              ),
          ],
        ),
        if (_score > 0) ...[
          TextField(
            controller: _comment,
            maxLength: 500,
            decoration: const InputDecoration(labelText: 'Comment (optional)'),
          ),
          TextButton(
            onPressed: widget.busy
                ? null
                : () => widget.onRate(_score, _comment.text.trim()),
            child: const Text('Submit rating'),
          ),
        ],
      ] else if (trip['review'] != null)
        const Text(
          'Your rating has been saved. Thank you for your feedback.',
          textAlign: TextAlign.center,
        ),
      const SizedBox(height: 16),
      SolidSurface(
        padding: const EdgeInsets.all(16),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Positioned.fill(
              child: IgnorePointer(
                child: Center(
                  child: Transform.rotate(
                    angle: -.34,
                    child: _PaymentReceiverStamp(
                      label: paid ? 'PAID TO DRIVER' : 'PAY TO DRIVER',
                    ),
                  ),
                ),
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Trip Details',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
                RideFact(
                  'Pickup Location',
                  '${trip['pickup_address'] ?? 'Not recorded'}',
                ),
                RideFact(
                  'Destination',
                  '${trip['dropoff_address'] ?? 'Not recorded'}',
                ),
                RideFact('Payment Method', method.toUpperCase()),
                RideFact(
                  trip['actual_distance_m'] != null
                      ? 'Distance'
                      : 'Est. distance',
                  rideDistance(
                    trip['actual_distance_m'] ?? trip['estimated_distance_m'],
                  ),
                ),
                RideFact(
                  trip['actual_duration_s'] != null
                      ? 'Duration'
                      : 'Est. duration',
                  rideDuration(
                    trip['actual_duration_s'] ?? trip['estimated_duration_s'],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      RideCostDetails(
        trip: trip,
        payment: payment,
        review: rideMap(widget.data['review']),
      ),
      const SizedBox(height: 12),
      widget.actions,
    ];
    final footer = SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 12),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: widget.onHome,
                style: OutlinedButton.styleFrom(
                  foregroundColor: RideTokens.accent,
                  side: const BorderSide(color: RideTokens.accent),
                  minimumSize: const Size(0, 52),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(28),
                  ),
                ),
                child: const Text('Back to home'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton(
                onPressed: widget.busy ? null : widget.onReceipt,
                style: FilledButton.styleFrom(
                  backgroundColor: RideTokens.accent,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(0, 52),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(28),
                  ),
                ),
                child: const Text('Download bill'),
              ),
            ),
          ],
        ),
      ),
    );
    final capture = Container(
      width: MediaQuery.sizeOf(context).width,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 72,
            child: Column(
              children: [
                Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(top: 8, bottom: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFCCCCCC),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const Expanded(
                  child: Row(
                    children: [
                      SizedBox(
                        width: 48,
                        child: Icon(Icons.arrow_back_ios_new),
                      ),
                      Expanded(
                        child: Text(
                          "You've arrived",
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      SizedBox(width: 48, child: Icon(Icons.ios_share_rounded)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          ListView(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            children: content,
          ),
          footer,
        ],
      ),
    );

    return Stack(
      children: [
        Column(
          children: [
            Expanded(
              child: ListView(
                controller: widget.scrollController,
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                children: content,
              ),
            ),
            footer,
          ],
        ),
        if (widget.captureKey != null)
          Positioned.fill(
            child: IgnorePointer(
              child: Opacity(
                opacity: .01,
                child: SingleChildScrollView(
                  child: SizedBox(
                    width: MediaQuery.sizeOf(context).width,
                    child: RepaintBoundary(
                      key: widget.captureKey,
                      child: capture,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _PaymentReceiverStamp extends StatelessWidget {
  final String label;
  const _PaymentReceiverStamp({required this.label});

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 164,
    height: 164,
    child: CustomPaint(
      painter: _PaymentStampPainter(label),
      child: Center(
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0x5517834B), width: 2),
          ),
          child: const Icon(
            Icons.payments_outlined,
            size: 27,
            color: Color(0x5517834B),
          ),
        ),
      ),
    ),
  );
}

class _PaymentStampPainter extends CustomPainter {
  final String label;
  _PaymentStampPainter(this.label);

  static const _ink = Color(0x5517834B);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final paint = Paint()
      ..color = _ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawCircle(center, 76, paint);
    canvas.drawCircle(center, 70, paint..strokeWidth = 1.4);
    _drawArcText(canvas, center, label, 59, math.pi, math.pi * 2);
    _drawArcText(
      canvas,
      center,
      'DIRECT RECEIVER',
      59,
      0,
      math.pi,
      reverse: true,
    );
  }

  void _drawArcText(
    Canvas canvas,
    Offset center,
    String text,
    double radius,
    double start,
    double end, {
    bool reverse = false,
  }) {
    final chars = (reverse ? text.split('').reversed : text.split('')).toList();
    final step = (end - start) / math.max(chars.length - 1, 1);
    for (var i = 0; i < chars.length; i++) {
      final theta = start + step * i;
      final painter = TextPainter(
        text: TextSpan(
          text: chars[i],
          style: const TextStyle(
            color: _ink,
            fontSize: 9,
            fontWeight: FontWeight.w800,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final rotation = reverse ? theta - math.pi / 2 : theta + math.pi / 2;
      canvas.save();
      canvas.translate(
        center.dx + math.cos(theta) * radius,
        center.dy + math.sin(theta) * radius,
      );
      canvas.rotate(rotation);
      painter.paint(canvas, Offset(-painter.width / 2, -painter.height / 2));
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _PaymentStampPainter oldDelegate) =>
      oldDelegate.label != label;
}
