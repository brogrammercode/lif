import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/glass_chip.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/settings/widgets/settings_secondary.dart';
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
  late final UserAppRepository _repository =
      widget.repository ?? UserAppRepository();
  late final DriverOperationsRepository _operations =
      widget.operationsRepository ?? DriverOperationsRepository();
  List<Map<String, dynamic>> _items = const [];
  Object? _error;
  bool _loading = true;
  bool _opening = false;
  String _filter = 'ALL';
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool preserve = false}) async {
    final generation = ++_generation;
    if (!preserve && mounted) setState(() => _loading = true);
    try {
      final value = await _repository.notifications();
      if (!mounted || generation != _generation) return;
      setState(() {
        _items = value;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      if (preserve && _items.isNotEmpty) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
        return;
      }
      setState(() {
        _error = error;
        _loading = false;
      });
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
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.NOTIFICATIONS,
    glass: true,
    scrollable: true,
    action: IconButton(
      tooltip: 'Refresh notifications',
      onPressed: _loading ? null : () => _load(preserve: true),
      icon: const Icon(Icons.refresh_rounded, color: GlassTokens.accent),
    ),
    child: _body(),
  );

  Widget _body() {
    if (_loading && _items.isEmpty) return const SettingsListSkeleton(rows: 4);
    if (_error != null && _items.isEmpty) {
      return AppLoadError(
        message: ApiResult.errorMessage(_error!),
        onRetry: _load,
      );
    }
    final unread = _items.where((item) => item['read_at'] == null).length;
    final visible = _filter == 'UNREAD'
        ? _items.where((item) => item['read_at'] == null).toList()
        : _items;
    return RefreshIndicator(
      onRefresh: () => _load(preserve: true),
      color: GlassTokens.accent,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 30),
        children: [
          SettingsIntroCard(
            icon: unread == 0
                ? Icons.notifications_none_rounded
                : Icons.notifications_active_outlined,
            title: unread == 0
                ? 'You are all caught up'
                : '$unread unread ${unread == 1 ? 'update' : 'updates'}',
            body:
                'Ride progress, account reviews, payments and support replies stay together here.',
            footer: Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                LiquidGlassChip(
                  label: 'All (${_items.length})',
                  icon: Icons.inbox_outlined,
                  selected: _filter == 'ALL',
                  onPressed: () => setState(() => _filter = 'ALL'),
                ),
                LiquidGlassChip(
                  label: 'Unread ($unread)',
                  icon: Icons.mark_email_unread_outlined,
                  selected: _filter == 'UNREAD',
                  onPressed: () => setState(() => _filter = 'UNREAD'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          SettingsSectionHeader(
            title: _filter == 'UNREAD' ? 'Unread updates' : 'Recent updates',
            helper:
                'Tap an update to open its related ride, account or request.',
          ),
          const SizedBox(height: 12),
          if (visible.isEmpty)
            SettingsEmptyCard(
              icon: _filter == 'UNREAD'
                  ? Icons.mark_email_read_outlined
                  : Icons.notifications_none,
              title: _filter == 'UNREAD'
                  ? 'No unread updates'
                  : UserAppCopy.EMPTY_NOTIFICATIONS,
              body: _filter == 'UNREAD'
                  ? 'New activity will appear here without hiding your full history.'
                  : UserAppCopy.EMPTY_NOTIFICATIONS_DESCRIPTION,
            )
          else
            for (var index = 0; index < visible.length; index++) ...[
              _notification(visible[index]),
              if (index != visible.length - 1) const SizedBox(height: 12),
            ],
        ],
      ),
    );
  }

  Widget _notification(Map<String, dynamic> item) {
    final unread = item['read_at'] == null;
    final type = '${item['type'] ?? 'SYSTEM'}';
    return Semantics(
      button: true,
      label: unread ? 'Unread notification' : 'Read notification',
      child: LiquidGlassSurface(
        tint: unread ? const Color(0xFFCAE4FF) : null,
        padding: EdgeInsets.zero,
        child: InkWell(
          onTap: () => _open(item),
          borderRadius: BorderRadius.circular(24),
          child: Padding(
            padding: const EdgeInsets.all(17),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                LiquidGlassSurface(
                  radius: 99,
                  padding: const EdgeInsets.all(11),
                  child: Icon(_icon(type), size: 21, color: _color(type)),
                ),
                const SizedBox(width: 13),
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
                              style: TextStyle(
                                color: GlassTokens.ink,
                                fontSize: 14,
                                height: 1.3,
                                fontWeight: unread
                                    ? FontWeight.w700
                                    : FontWeight.w600,
                              ),
                            ),
                          ),
                          if (unread) ...[
                            const SizedBox(width: 9),
                            Container(
                              width: 8,
                              height: 8,
                              margin: const EdgeInsets.only(top: 5),
                              decoration: const BoxDecoration(
                                color: GlassTokens.accent,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '${item['body'] ?? ''}',
                        style: const TextStyle(
                          color: GlassTokens.muted,
                          fontSize: 13,
                          height: 1.42,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          SettingsStatusPill(
                            label: readableEnum(type),
                            color: _color(type),
                          ),
                          const SizedBox(width: 9),
                          Expanded(
                            child: Text(
                              settingsDateTime(item['created_at']),
                              textAlign: TextAlign.end,
                              style: const TextStyle(
                                color: GlassTokens.muted,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
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
    'RIDE_UPDATE' => GlassTokens.accent,
    'ACCOUNT' => const Color(0xFF785B9B),
    'PROMOTION' => const Color(0xFFA66C28),
    _ => GlassTokens.muted,
  };
}
