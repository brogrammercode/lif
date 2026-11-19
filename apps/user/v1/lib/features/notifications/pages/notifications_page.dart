import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/notifications/controllers/notifications_controller.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class NotificationsPage extends StatefulWidget {
  final UserAppRepository? repository;
  final DriverOperationsRepository? operationsRepository;
  const NotificationsPage({
    super.key,
    this.repository,
    this.operationsRepository,
  });

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  late final _controller = NotificationsController(
    widget.repository ?? UserAppRepository(),
  )..addListener(_controllerChanged);
  late final DriverOperationsRepository _operations =
      widget.operationsRepository ?? DriverOperationsRepository();
  bool _opening = false;

  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  UserAppRepository get _repository => _controller.repository;
  List<Map<String, dynamic>> get _items => _controller.items;
  Object? get _error => _controller.error;
  bool get _loading => _controller.loading;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool preserve = false}) async {
    await _controller.load(preserve: preserve);
    final notice = _controller.notice;
    _controller.notice = null;
    if (mounted && notice != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(notice)));
    }
  }

  Future<void> _open(Map<String, dynamic> item) async {
    if (_opening) return;
    _opening = true;
    try {
      if (item['read_at'] == null) {
        await _repository.readNotification('${item['id']}');
        if (mounted) {
          setState(() => item['read_at'] = DateTime.now().toIso8601String());
        }
      }
      final data = rideMap(item['data']);
      if (data['ride_id'] is String) {
        final trip = await _operations.context('${data['ride_id']}');
        if (!mounted) return;
        await Navigator.pushNamed(
          context,
          trip['is_driver'] == true
              ? AppRoutes.driverRideDetail
              : AppRoutes.rideDetail,
          arguments: data['ride_id'],
        );
      } else if (data['driver_account'] == true) {
        if (!mounted) return;
        await Navigator.pushNamed(context, AppRoutes.driverAccount);
      } else if (data['ticket_id'] is String) {
        if (!mounted) return;
        await Navigator.pushNamed(
          context,
          AppRoutes.supportTicket,
          arguments: data['ticket_id'],
        );
      }
      if (mounted) await _load(preserve: true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      _opening = false;
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.NOTIFICATIONS,
    scrollable: true,
    child: _body(),
  );

  Widget _body() {
    if (_loading && _items.isEmpty) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 0),
        child: Column(
          children: [
            _NotificationSkeleton(),
            SizedBox(height: 16),
            _NotificationSkeleton(),
            SizedBox(height: 16),
            _NotificationSkeleton(),
          ],
        ),
      );
    }
    if (_error != null && _items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: AppLoadError(
          message: ApiResult.errorMessage(_error!),
          onRetry: _load,
        ),
      );
    }
    if (_items.isEmpty) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(20, 30, 20, 24),
        child: AppEmptyState(
          icon: Icons.notifications_none_rounded,
          title: 'You are all caught up',
          subtitle: UserAppCopy.EMPTY_NOTIFICATIONS_DESCRIPTION,
        ),
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
      itemCount: _items.length,
      separatorBuilder: (_, _) => const Padding(
        padding: EdgeInsets.only(left: 60),
        child: Divider(height: 1, color: Color(0xFFEAEAEA)),
      ),
      itemBuilder: (context, index) => _notification(_items[index]),
    );
  }

  Widget _notification(Map<String, dynamic> item) {
    final unread = item['read_at'] == null;
    final type = '${item['type'] ?? 'SYSTEM'}';
    final body = '${item['body'] ?? ''}'.trim();
    final date = DateTime.tryParse('${item['created_at'] ?? ''}')?.toLocal();
    return Semantics(
      button: true,
      label:
          '${unread ? 'Unread' : 'Read'} notification: ${item['title'] ?? '1More update'}',
      child: InkWell(
        onTap: () => _open(item),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _NotificationAvatar(icon: _icon(type), color: _color(type)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            '${item['title'] ?? '1More update'}',
                            style: const TextStyle(
                              fontSize: 14,
                              height: 1.35,
                              color: RideTokens.ink,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        if (unread) ...[
                          const SizedBox(width: 8),
                          const Padding(
                            padding: EdgeInsets.only(top: 5),
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: Color(0xFF2E6BE6),
                                shape: BoxShape.circle,
                              ),
                              child: SizedBox(width: 9, height: 9),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            date == null ? '' : _formattedDate(context, date),
                            style: const TextStyle(
                              fontSize: 12,
                              color: RideTokens.muted,
                            ),
                          ),
                        ),
                        Text(
                          date == null ? '' : _relativeTime(date),
                          style: const TextStyle(
                            fontSize: 12,
                            color: RideTokens.muted,
                          ),
                        ),
                      ],
                    ),
                    if (body.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 13,
                          vertical: 11,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF4F4F4),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          body,
                          style: const TextStyle(
                            fontSize: 14,
                            height: 1.4,
                            color: RideTokens.ink,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formattedDate(BuildContext context, DateTime date) {
    const weekdays = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    return '${weekdays[date.weekday - 1]} ${TimeOfDay.fromDateTime(date).format(context)}';
  }

  String _relativeTime(DateTime date) {
    final difference = DateTime.now().difference(date);
    if (difference.isNegative || difference.inMinutes < 1) return 'just now';
    if (difference.inMinutes < 60) {
      final minutes = difference.inMinutes;
      return '$minutes ${minutes == 1 ? 'minute' : 'minutes'} ago';
    }
    if (difference.inHours < 24) {
      final hours = difference.inHours;
      return '$hours ${hours == 1 ? 'hour' : 'hours'} ago';
    }
    final days = difference.inDays;
    if (days < 7) return '$days ${days == 1 ? 'day' : 'days'} ago';
    final weeks = days ~/ 7;
    return '$weeks ${weeks == 1 ? 'week' : 'weeks'} ago';
  }

  IconData _icon(String type) => switch (type) {
    'PAYMENT_UPDATE' => Icons.account_balance_wallet_outlined,
    'SAFETY' => Icons.health_and_safety_outlined,
    'RIDE_UPDATE' => Icons.route_outlined,
    'ACCOUNT' => Icons.manage_accounts_outlined,
    'PROMOTION' => Icons.local_offer_outlined,
    _ => Icons.notifications_none_rounded,
  };

  Color _color(String type) => switch (type) {
    'SAFETY' => const Color(0xFFB44B4B),
    'PAYMENT_UPDATE' => const Color(0xFF397864),
    'RIDE_UPDATE' => const Color(0xFF2E6BE6),
    'ACCOUNT' => const Color(0xFF785B9B),
    'PROMOTION' => const Color(0xFFA66C28),
    _ => RideTokens.muted,
  };
}

class _NotificationAvatar extends StatelessWidget {
  final IconData icon;
  final Color color;
  const _NotificationAvatar({required this.icon, required this.color});

  @override
  Widget build(BuildContext context) => Container(
    width: 48,
    height: 48,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: const Color(0xFFF4F4F4),
      border: Border.all(color: const Color(0xFFE7E7E7)),
    ),
    child: Icon(icon, size: 21, color: color),
  );
}

class _NotificationSkeleton extends StatelessWidget {
  const _NotificationSkeleton();
  @override
  Widget build(BuildContext context) => const Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SkeletonBox(width: 48, height: 48, circle: true),
      SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SkeletonBox(height: 13),
            SizedBox(height: 8),
            SkeletonBox(width: 125, height: 11),
            SizedBox(height: 12),
            SkeletonBox(height: 58),
          ],
        ),
      ),
    ],
  );
}
