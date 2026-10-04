import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/home/constants/home.constant.dart';

class RideDetailPage extends StatefulWidget {
  const RideDetailPage({super.key});
  @override
  State<RideDetailPage> createState() => _RideDetailPageState();
}

class _RideDetailPageState extends State<RideDetailPage> {
  final UserAppRepository _repository = UserAppRepository();
  late String _rideId;
  late Future<Map<String, dynamic>> _ride;
  bool _loading = false;
  bool _initialized = false;
  String _lastStatus = '';
  Timer? _refreshTimer;
  LatLng? _driverLocation;
  bool _locationLoaded = false;
  bool _loadingLocation = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _rideId = ModalRoute.of(context)?.settings.arguments as String? ?? '';
    _ride = _repository.ride(_rideId);
    _refreshTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (!mounted ||
          ![
            'REQUESTED',
            'SEARCHING',
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_WAITING',
            'IN_PROGRESS',
          ].contains(_lastStatus)) {
        return;
      }
      setState(() => _ride = _repository.ride(_rideId));
      _refreshDriverLocation();
    });
    _initialized = true;
  }

  Future<void> _refreshDriverLocation() async {
    if (_loadingLocation || !mounted) return;
    _loadingLocation = true;
    try {
      final locations = await _repository.rideLocations(_rideId);
      if (!mounted || locations.isEmpty) return;
      final latest = locations.last;
      final latitude = double.tryParse('${latest['latitude']}');
      final longitude = double.tryParse('${latest['longitude']}');
      if (latitude == null || longitude == null) return;
      setState(() {
        _driverLocation = LatLng(latitude, longitude);
        _locationLoaded = true;
      });
    } catch (_) {
      // Location data is optional; the ride status and details remain usable.
    } finally {
      _loadingLocation = false;
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _perform(Future<void> Function() action, String message) async {
    setState(() => _loading = true);
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
      setState(() => _ride = _repository.ride(_rideId));
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text(UserAppCopy.CANCEL_RIDE),
        content: const Text(UserAppCopy.RIDE_CANCEL_CONFIRMATION),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text(UserAppCopy.CANCEL),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text(UserAppCopy.CONFIRM),
          ),
        ],
      ),
    );
    if (confirmed == true)
      await _perform(
        () => _repository.cancelRide(_rideId, UserAppCopy.CANCEL_RIDE),
        UserAppCopy.CANCEL_RIDE,
      );
  }

  Future<void> _checkout() async {
    final methods = await _repository.paymentMethods();
    if (!mounted) return;
    if (methods.isEmpty) {
      final addMethod = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text(UserAppCopy.PAYMENT_METHODS),
          content: const Text(UserAppCopy.EMPTY_PAYMENTS_DESCRIPTION),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text(UserAppCopy.CANCEL),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text(UserAppCopy.ADD),
            ),
          ],
        ),
      );
      if (addMethod == true && mounted)
        await Navigator.pushNamed(context, AppRoutes.paymentMethods);
      return;
    }
    final selected = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => Container(
        padding: EdgeInsets.fromLTRB(
          16.w,
          18.h,
          16.w,
          MediaQuery.paddingOf(context).bottom + 16.h,
        ),
        decoration: BoxDecoration(
          color: AppColors.pureWhite,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22.r)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              UserAppCopy.START_PAYMENT,
              style: TextStyle(
                fontSize: 18.sp,
                fontWeight: FontWeight.w900,
                color: AppColors.textPrimary,
              ),
            ),
            SizedBox(height: 12.h),
            ...methods.map(
              (method) => ListTile(
                leading: const Icon(
                  Icons.credit_card_outlined,
                  color: AppColors.primaryGreen,
                ),
                title: Text(
                  '${method['type'] ?? ''} ${method['upi_handle'] ?? ''} ${method['card_last4'] == null ? '' : '•••• ${method['card_last4']}'}',
                ),
                subtitle: method['is_default'] == true
                    ? const Text('DEFAULT')
                    : null,
                onTap: () => Navigator.pop(sheetContext, method),
              ),
            ),
          ],
        ),
      ),
    );
    if (selected == null) return;
    setState(() => _loading = true);
    try {
      final result = await _repository.checkout(
        _rideId,
        paymentMethodId: '${selected['id']}',
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Checkout status: ${result['status'] ?? 'PENDING'}'),
        ),
      );
      setState(() => _ride = _repository.ride(_rideId));
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirmStart() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text(UserAppCopy.CONFIRM_START),
        content: const Text(UserAppCopy.START_CONFIRMATION),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text(UserAppCopy.CANCEL),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text(UserAppCopy.CONFIRM),
          ),
        ],
      ),
    );
    if (confirmed == true)
      await _perform(
        () => _repository.confirmRideStart(_rideId),
        UserAppCopy.START_CONFIRMED,
      );
  }

  Future<void> _showReceipt() async {
    try {
      final receipt = await _repository.receipt(_rideId);
      final payment = receipt['payment'] is Map
          ? Map<String, dynamic>.from(receipt['payment'] as Map)
          : <String, dynamic>{};
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text(UserAppCopy.RIDE_RECEIPT),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${receipt['pickup_address'] ?? ''}',
                style: TextStyle(
                  fontSize: 13.sp,
                  color: AppColors.textSecondary,
                ),
              ),
              SizedBox(height: 6.h),
              Text(
                '${receipt['dropoff_address'] ?? ''}',
                style: TextStyle(
                  fontSize: 13.sp,
                  color: AppColors.textSecondary,
                ),
              ),
              SizedBox(height: 14.h),
              Text(
                'Fare  ₹${receipt['final_fare'] ?? receipt['estimated_fare'] ?? '—'}',
                style: TextStyle(
                  fontSize: 16.sp,
                  fontWeight: FontWeight.w900,
                  color: AppColors.textPrimary,
                ),
              ),
              SizedBox(height: 5.h),
              Text(
                'Payment  ${payment['status'] ?? 'NOT STARTED'}',
                style: TextStyle(
                  fontSize: 12.sp,
                  color: AppColors.primaryGreen,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Done'),
            ),
          ],
        ),
      );
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.RIDES,
    child: FutureBuilder<Map<String, dynamic>>(
      future: _ride,
      builder: (context, snapshot) {
        if (snapshot.hasError)
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: () => setState(() => _ride = _repository.ride(_rideId)),
          );
        if (!snapshot.hasData)
          return const Center(
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primaryGreen,
            ),
          );
        final ride = snapshot.data!;
        final status = '${ride['status'] ?? ''}';
        _lastStatus = status;
        final isActive = [
          'REQUESTED',
          'SEARCHING',
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_WAITING',
          'IN_PROGRESS',
        ].contains(status);
        if (isActive && !_locationLoaded && !_loadingLocation) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _refreshDriverLocation();
          });
        }
        final driver = ride['driver'] is Map
            ? Map<String, dynamic>.from(ride['driver'] as Map)
            : <String, dynamic>{};
        final driverUser = driver['user'] is Map
            ? Map<String, dynamic>.from(driver['user'] as Map)
            : <String, dynamic>{};
        final vehicle = ride['vehicle'] is Map
            ? Map<String, dynamic>.from(ride['vehicle'] as Map)
            : <String, dynamic>{};
        final payment = ride['payment'] is Map
            ? Map<String, dynamic>.from(ride['payment'] as Map)
            : <String, dynamic>{};
        return ListView(
          padding: EdgeInsets.only(bottom: 24.h),
          children: [
            SizedBox(height: 8.h),
            if (isActive) ...[_trackingMap(ride), SizedBox(height: 12.h)],
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    status.replaceAll('_', ' '),
                    style: TextStyle(
                      fontSize: 14.sp,
                      color: AppColors.primaryGreen,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  SizedBox(height: 18.h),
                  _detailLine(
                    UserAppCopy.PICKUP,
                    '${ride['pickup_address'] ?? ''}',
                    Icons.circle,
                  ),
                  Padding(
                    padding: EdgeInsets.only(left: 5.w),
                    child: Container(
                      height: 24.h,
                      width: 1.w,
                      color: AppColors.borderGrey,
                    ),
                  ),
                  _detailLine(
                    UserAppCopy.DROP_OFF,
                    '${ride['dropoff_address'] ?? ''}',
                    Icons.location_on,
                  ),
                  SizedBox(height: 18.h),
                  const Divider(color: AppColors.borderGrey),
                  _valueLine(
                    UserAppCopy.VEHICLE,
                    '${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''}',
                  ),
                  _valueLine(
                    UserAppCopy.DISTANCE,
                    '${ride['estimated_distance_m'] ?? '—'} m',
                  ),
                  _valueLine(
                    'Fare',
                    '₹${ride['final_fare'] ?? ride['estimated_fare'] ?? '—'}',
                  ),
                  if (driverUser.isNotEmpty)
                    _valueLine(
                      'Driver',
                      '${driverUser['first_name'] ?? ''} ${driverUser['last_name'] ?? ''}',
                    ),
                ],
              ),
            ),
            SizedBox(height: 16.h),
            if (status == 'COMPLETED')
              AppButton(
                text: UserAppCopy.VIEW_RECEIPT,
                onPressed: _showReceipt,
                isLoading: _loading,
              ),
            if (status == 'COMPLETED' &&
                (payment.isEmpty ||
                    [
                      'PENDING',
                      'FAILED',
                      'REQUIRES_ACTION',
                    ].contains(payment['status']))) ...[
              SizedBox(height: 10.h),
              AppButton(
                text: UserAppCopy.PAYMENT_CHECKOUT,
                onPressed: _checkout,
                isLoading: _loading,
                backgroundColor: AppColors.deepOnyx,
                borderColor: AppColors.deepOnyx,
              ),
            ],
            if (status == 'DRIVER_WAITING') ...[
              AppButton(
                text: UserAppCopy.CONFIRM_START,
                onPressed: _confirmStart,
                isLoading: _loading,
              ),
              SizedBox(height: 10.h),
            ],
            if ([
              'DRAFT',
              'REQUESTED',
              'SEARCHING',
              'DRIVER_ASSIGNED',
              'DRIVER_ARRIVING',
              'DRIVER_WAITING',
            ].contains(status))
              AppButton(
                text: UserAppCopy.CANCEL_RIDE,
                onPressed: _cancel,
                isLoading: _loading,
                backgroundColor: AppColors.googleRed,
                borderColor: AppColors.googleRed,
              ),
            if (status == 'COMPLETED' &&
                (ride['reviews'] as List? ?? []).isEmpty) ...[
              SizedBox(height: 12.h),
              OutlinedButton(
                onPressed: _loading ? null : () => _review(ride),
                child: const Text(UserAppCopy.RATE_RIDE),
              ),
            ],
          ],
        );
      },
    ),
  );

  Future<void> _review(Map<String, dynamic> ride) async {
    final driver = ride['driver'] is Map
        ? Map<String, dynamic>.from(ride['driver'] as Map)
        : <String, dynamic>{};
    final driverId = '${driver['user_id'] ?? ''}';
    if (driverId.isEmpty) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('This ride has no driver to rate.')),
        );
      return;
    }
    final score = await showDialog<int>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: const Text(UserAppCopy.RATE_PROMPT),
        children: List.generate(
          5,
          (index) => SimpleDialogOption(
            onPressed: () => Navigator.pop(dialogContext, index + 1),
            child: Row(
              children: [
                Icon(Icons.star, color: AppColors.gold, size: 20.w),
                SizedBox(width: 8.w),
                Text('${index + 1}'),
              ],
            ),
          ),
        ),
      ),
    );
    if (score != null)
      await _perform(
        () => _repository.review(_rideId, driverId, score, null),
        'Thanks for rating your ride.',
      );
  }

  Widget _trackingMap(Map<String, dynamic> ride) {
    final route = ride['route'] is Map
        ? Map<String, dynamic>.from(ride['route'] as Map)
        : <String, dynamic>{};
    final routeData = route['route_data'] is Map
        ? Map<String, dynamic>.from(route['route_data'] as Map)
        : <String, dynamic>{};
    final geometry = routeData['geometry'] as List? ?? const [];
    final points = geometry
        .whereType<List>()
        .where((point) => point.length >= 2)
        .map(
          (point) => LatLng(
            (point[1] as num).toDouble(),
            (point[0] as num).toDouble(),
          ),
        )
        .toList();
    final pickup = LatLng(
      double.tryParse('${ride['pickup_latitude']}') ??
          HomeConstants.DEFAULT_LOCATION.latitude,
      double.tryParse('${ride['pickup_longitude']}') ??
          HomeConstants.DEFAULT_LOCATION.longitude,
    );
    final dropoff = LatLng(
      double.tryParse('${ride['dropoff_latitude']}') ?? pickup.latitude,
      double.tryParse('${ride['dropoff_longitude']}') ?? pickup.longitude,
    );
    if (points.isEmpty) return const SizedBox.shrink();
    final boundsPoints = [
      ...points,
      if (_driverLocation != null) _driverLocation!,
    ];
    var minLatitude = boundsPoints.first.latitude;
    var maxLatitude = minLatitude;
    var minLongitude = boundsPoints.first.longitude;
    var maxLongitude = minLongitude;
    for (final point in boundsPoints.skip(1)) {
      minLatitude = point.latitude < minLatitude ? point.latitude : minLatitude;
      maxLatitude = point.latitude > maxLatitude ? point.latitude : maxLatitude;
      minLongitude = point.longitude < minLongitude
          ? point.longitude
          : minLongitude;
      maxLongitude = point.longitude > maxLongitude
          ? point.longitude
          : maxLongitude;
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(18.r),
      child: SizedBox(
        height: 210.h,
        child: FlutterMap(
          options: MapOptions(
            initialCameraFit: CameraFit.bounds(
              bounds: LatLngBounds(
                LatLng(minLatitude, minLongitude),
                LatLng(maxLatitude, maxLongitude),
              ),
              padding: EdgeInsets.all(34.r),
            ),
          ),
          children: [
            TileLayer(
              urlTemplate: HomeConstants.OPEN_STREET_MAP_TILE_URL,
              userAgentPackageName: HomeConstants.MAP_USER_AGENT,
              tileProvider: NetworkTileProvider(
                headers: HomeConstants.tileHeaders,
              ),
            ),
            PolylineLayer(
              polylines: [
                Polyline(
                  points: points,
                  color: AppColors.primaryGreen,
                  strokeWidth: 5.r,
                ),
              ],
            ),
            MarkerLayer(
              markers: [
                Marker(
                  point: pickup,
                  width: 32.r,
                  height: 32.r,
                  child: Icon(
                    Icons.trip_origin,
                    color: AppColors.primaryGreen,
                    size: 22.r,
                  ),
                ),
                Marker(
                  point: dropoff,
                  width: 32.r,
                  height: 32.r,
                  child: Icon(
                    Icons.location_on,
                    color: AppColors.googleRed,
                    size: 27.r,
                  ),
                ),
                if (_driverLocation != null)
                  Marker(
                    point: _driverLocation!,
                    width: 40.r,
                    height: 40.r,
                    child: Container(
                      decoration: const BoxDecoration(
                        color: AppColors.pureWhite,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.directions_car,
                        color: AppColors.primaryGreen,
                        size: 23.r,
                      ),
                    ),
                  ),
              ],
            ),
            RichAttributionWidget(
              attributions: [
                TextSourceAttribution('© OpenStreetMap contributors'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _detailLine(String label, String value, IconData icon) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Icon(icon, size: 12.w, color: AppColors.primaryGreen),
      SizedBox(width: 10.w),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 11.sp,
                color: AppColors.textTertiary,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 3.h),
            Text(
              value,
              style: TextStyle(
                fontSize: 14.sp,
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    ],
  );
  Widget _valueLine(String label, String value) => Padding(
    padding: EdgeInsets.only(top: 8.h),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(fontSize: 13.sp, color: AppColors.textSecondary),
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 13.sp,
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    ),
  );
}
