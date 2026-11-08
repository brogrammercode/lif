import 'package:user/features/driver_account/controllers/driver_account_controller.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/glass_chip.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_account/driver_account.repo.dart';
import 'package:user/features/driver_account/pages/driver_documents_page.dart';
import 'package:user/features/driver_account/widgets/payout_change_form.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';
import 'package:user/features/driver_vehicles/widgets/catalog_suggestion_form.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/support/widgets/support_contact_card.dart';

class DriverAccountPage extends StatefulWidget {
  final DriverAccountRepository? repository;
  const DriverAccountPage({super.key, this.repository});
  @override
  State<DriverAccountPage> createState() => _DriverAccountState();
}

class _DriverAccountState extends State<DriverAccountPage>
    with WidgetsBindingObserver {
  late final _controller = DriverAccountController(
    widget.repository ?? DriverAccountRepository(),
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  DriverAccountRepository get repo => _controller.repo;
  Map<String, dynamic>? get _data => _controller.data;
  Map<String, dynamic>? get _requests => _controller.requests;
  set _requests(Map<String, dynamic>? value) => _controller.requests = value;
  String? get _error => _controller.error;
  int get _tab => _controller.tab;
  set _tab(int value) => _controller.tab = value;
  int get _page => _controller.page;
  set _page(int value) => _controller.page = value;
  bool get _loading => _controller.loading;
  bool get _busy => _controller.busy;
  set _busy(bool value) => _controller.busy = value;
  bool get _exited => _data?['exited'] == true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed &&
        ModalRoute.of(context)?.isCurrent == true &&
        !_busy) {
      _load();
    }
  }

  Future<void> _load() => _controller.load();

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _change() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => AppPage(
          glass: true,
          title: 'Request account change',
          child: PayoutChangeForm(repository: repo),
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _correct(Map<String, dynamic> row, bool model) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CatalogSuggestionForm(
          brand: model ? rideMap(row['brand']) : null,
          initial: row,
        ),
      ),
    );
    if (mounted) await _load();
  }

  Widget _link(
    String title,
    String route, {
    required IconData icon,
    required String subtitle,
  }) => DriverLinkTile(
    icon: icon,
    title: title,
    subtitle: subtitle,
    onTap: () async {
      await Navigator.pushNamed(context, route);
      if (mounted) await _load();
    },
  );
  @override
  Widget build(BuildContext context) => AppPage(
    glass: true,
    title: 'Driver account',
    action: IconButton(
      tooltip: 'Refresh account',
      onPressed: _loading ? null : _load,
      icon: const Icon(Icons.refresh),
    ),
    child: Column(
      children: [
        Wrap(
          spacing: 8,
          children: [
            for (final e in {
              0: 'Account',
              1: 'Payout details',
              2: 'My requests',
              3: 'Safety & help',
            }.entries)
              LiquidGlassChip(
                label: e.value,
                selected: _tab == e.key,
                onPressed: _loading
                    ? null
                    : () {
                        setState(() {
                          _tab = e.key;
                          _page = 1;
                          _requests = null;
                        });
                        _load();
                      },
              ),
          ],
        ),
        const SizedBox(height: 14),
        if (_error != null && _data != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: DriverNotice(
              icon: Icons.sync_problem_rounded,
              message: '$_error. Pull to refresh or retry.',
              error: true,
            ),
          ),
        Expanded(
          child: _data == null
              ? (_loading
                    ? const DriverListSkeleton(rows: 4)
                    : AppLoadError(
                        message: _error ?? 'Account unavailable',
                        onRetry: _load,
                      ))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(bottom: 24),
                    children: _body(),
                  ),
                ),
        ),
      ],
    ),
  );
  List<Widget> _body() {
    final app = rideMap(_data!['application']),
        driver = rideMap(_data!['driver']);
    if (_tab == 0) {
      return [
        DriverPageIntro(
          icon: Icons.badge_outlined,
          title: 'Driver profile & verification',
          description:
              'Your reviewed identity, partner agreement, vehicles and account documents stay together here.',
          trailing: DriverStatusPill(
            label: '${driver['verification_status'] ?? 'Pending'}',
            status: '${driver['verification_status']}',
          ),
        ),
        const SizedBox(height: 16),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Account status',
                style: TextStyle(
                  color: GlassTokens.ink,
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 10),
              DriverInfoRow(
                label: 'Partner application',
                value: '${app['status'] ?? 'Not applied'}'.replaceAll('_', ' '),
              ),
              DriverInfoRow(
                label: 'Verification',
                value: '${driver['verification_status'] ?? 'Pending'}'
                    .replaceAll('_', ' '),
              ),
              DriverInfoRow(
                label: 'Availability',
                value: '${driver['availability'] ?? 'Offline'}'.replaceAll(
                  '_',
                  ' ',
                ),
              ),
              DriverInfoRow(
                label: 'Driver reference',
                value: '${driver['id'] ?? 'Unavailable'}',
              ),
              if (_exited)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: DriverNotice(
                    icon: Icons.logout_rounded,
                    message:
                        'Exit complete. Driving is disabled, while statements, settlement documents and support remain available.',
                    warning: true,
                  ),
                ),
              if (driver['availability'] == 'SUSPENDED')
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: DriverNotice(
                    icon: Icons.block_rounded,
                    message:
                        'Driving is suspended. Contact Support to resolve the restriction; statements and documents remain accessible.',
                    error: true,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _link(
          'Earnings & transactions',
          AppRoutes.driverFinances,
          icon: Icons.account_balance_wallet_outlined,
          subtitle: 'Trip fares, direct collection and reviewed charges',
        ),
        const SizedBox(height: 12),
        DriverLinkTile(
          icon: Icons.folder_copy_outlined,
          title: 'Vehicles & reviewed documents',
          subtitle: 'Private vehicle documents and replacement reviews',
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => DriverDocumentsPage(readOnly: _exited),
            ),
          ),
        ),
        const SizedBox(height: 12),
        _link(
          'Personal profile',
          AppRoutes.profile,
          icon: Icons.person_outline_rounded,
          subtitle: 'Name, email, phone and profile photo',
        ),
        const SizedBox(height: 12),
        _link(
          'Partner application & final agreement',
          AppRoutes.partnerProgram,
          icon: Icons.handshake_outlined,
          subtitle: 'Application review, confirmation and final PDF',
        ),
        const SizedBox(height: 12),
        _link(
          'Exit request & settlement PDF',
          AppRoutes.driverExit,
          icon: Icons.exit_to_app_rounded,
          subtitle: 'Exit status, recorded dues and settlement document',
        ),
        const SizedBox(height: 16),
        if (app['final_pdf_id'] is String)
          OutlinedButton.icon(
            onPressed: _busy
                ? null
                : () => _run(
                    () => PartnerProgramRepository().download(
                      app['final_pdf_id'] as String,
                    ),
                  ),
            icon: const Icon(Icons.download),
            label: const Text('Open final partner PDF'),
          ),
        const SizedBox(height: 20),
        const AppSectionLabel('Application review'),
        const SizedBox(height: 10),
        for (final field in rideMaps(app['fields']))
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: LiquidGlassSurface(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${rideMap(field['definition'])['label'] ?? 'Document'}',
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                  ),
                  const SizedBox(width: 10),
                  DriverStatusPill(
                    label: '${field['status']}',
                    status: '${field['status']}',
                  ),
                ],
              ),
            ),
          ),
        for (final field in rideMaps(app['fields']))
          for (final asset
              in (field['asset_ids'] is List
                  ? field['asset_ids'] as List
                  : const []))
            TextButton.icon(
              onPressed: _busy
                  ? null
                  : () => _run(
                      () => PartnerProgramRepository().download('$asset'),
                    ),
              icon: const Icon(Icons.description_outlined),
              label: Text(
                'Open ${rideMap(field['definition'])['label'] ?? 'application document'}',
              ),
            ),
        const DriverNotice(
          icon: Icons.privacy_tip_outlined,
          message:
              'Ordinary profile changes are separate from reviewed KYC. Contact Support for legal identity or document corrections. Reviews are manual and no automatic expiry rule is applied.',
        ),
      ];
    }
    if (_tab == 1) {
      return [
        const DriverPageIntro(
          icon: Icons.account_balance_outlined,
          title: 'Reviewed payment destination',
          description:
              'Cash and direct UPI go to you. There is no platform wallet or automatic payout. Changes require admin approval.',
        ),
        const SizedBox(height: 16),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Current destination',
                style: TextStyle(
                  color: GlassTokens.ink,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                _data!['approved_payout'] == null
                    ? (rideMaps(_data!['initial_payout']).isEmpty
                          ? 'No reviewed destination is configured.'
                          : rideMaps(_data!['initial_payout'])
                                .map((v) => '${v['label']}: ${v['display']}')
                                .join('\n'))
                    : _summary(
                        rideMap(rideMap(_data!['approved_payout'])['summary']),
                      ),
                style: const TextStyle(color: GlassTokens.muted, height: 1.55),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        LiquidGlassButton(
          onPressed:
              _loading ||
                  _busy ||
                  _exited ||
                  rideMaps(
                    _data!['payout_changes'],
                  ).any((v) => v['status'] == 'PENDING')
              ? null
              : _change,
          text: 'Request account change',
        ),
        for (final row in rideMaps(_data!['payout_changes']))
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${row['status']} - ${rideTime(row['created_at'])}',
                    style: const TextStyle(
                      color: GlassTokens.ink,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(_summary(rideMap(row['summary']))),
                  if (row['rejection_reason'] != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: DriverNotice(
                        icon: Icons.info_outline_rounded,
                        message: '${row['rejection_reason']}',
                        error: true,
                      ),
                    ),
                ],
              ),
            ),
          ),
      ];
    }
    if (_tab == 2) {
      return [
        const DriverPageIntro(
          icon: Icons.fact_check_outlined,
          title: 'Your catalog requests',
          description:
              'Track your suggested brands and models. Rejected entries can be corrected and returned for review.',
        ),
        const SizedBox(height: 18),
        for (final model in [false, true]) ...[
          AppSectionLabel(model ? 'Models' : 'Brands'),
          for (final row in rideMaps(_requests?[model ? 'models' : 'brands']))
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: DriverLinkTile(
                icon: model
                    ? Icons.directions_car_filled_outlined
                    : Icons.branding_watermark_outlined,
                title: '${row['name']}',
                subtitle: row['rejection_reason'] == null
                    ? (model
                          ? 'Vehicle model request'
                          : 'Vehicle brand request')
                    : '${row['rejection_reason']}',
                trailing: DriverStatusPill(
                  label: '${row['status']}',
                  status: '${row['status']}',
                ),
                onTap: !_exited && row['status'] == 'REJECTED' && !_loading
                    ? () => _correct(row, model)
                    : null,
              ),
            ),
        ],
        if (_requests != null &&
            rideMaps(_requests!['brands']).isEmpty &&
            rideMaps(_requests!['models']).isEmpty)
          const AppEmptyState(
            icon: Icons.inventory_2_outlined,
            title: 'No catalog requests',
            subtitle: 'Your suggested brands and models will appear here.',
          ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            TextButton(
              onPressed: _loading || _page == 1
                  ? null
                  : () {
                      setState(() => _page--);
                      _load();
                    },
              child: const Text('Previous'),
            ),
            Text('Page $_page'),
            TextButton(
              onPressed:
                  _loading ||
                      _requests == null ||
                      (_page * 20 >=
                              (rideNumber(_requests!['brand_count']) ?? 0) &&
                          _page * 20 >=
                              (rideNumber(_requests!['model_count']) ?? 0))
                  ? null
                  : () {
                      setState(() => _page++);
                      _load();
                    },
              child: const Text('Next'),
            ),
          ],
        ),
      ];
    }
    return [
      const DriverPageIntro(
        icon: Icons.health_and_safety_outlined,
        title: 'Safety & help',
        description:
            'Reach configured support, manage emergency contacts and review trip or exit records.',
      ),
      const SizedBox(height: 16),
      const SupportContactCard(),
      const SizedBox(height: 12),
      _link(
        'Emergency contacts',
        AppRoutes.emergencyContacts,
        icon: Icons.contact_emergency_outlined,
        subtitle: 'People you can call or message manually',
      ),
      const SizedBox(height: 12),
      _link(
        'Support requests',
        AppRoutes.support,
        icon: Icons.support_agent_rounded,
        subtitle: 'Configured channels and your persisted requests',
      ),
      const SizedBox(height: 12),
      _link(
        'Driver trip history',
        AppRoutes.driverRides,
        icon: Icons.route_outlined,
        subtitle: 'Assigned rides, collection and linked issues',
      ),
      const SizedBox(height: 12),
      _link(
        'Exit request & dues',
        AppRoutes.driverExit,
        icon: Icons.exit_to_app_rounded,
        subtitle: 'Exit status, settlement balance and final PDF',
      ),
      const SizedBox(height: 16),
      OutlinedButton(
        onPressed: _busy
            ? null
            : () => _run(() async {
                if (!await Geolocator.openAppSettings()) {
                  throw StateError('Could not open app settings.');
                }
              }),
        child: const Text('App permissions'),
      ),
      OutlinedButton(
        onPressed: _busy
            ? null
            : () => _run(() async {
                if (!await Geolocator.openLocationSettings()) {
                  throw StateError('Could not open location settings.');
                }
              }),
        child: const Text('Device location settings'),
      ),
      const SizedBox(height: 12),
      const DriverNotice(
        icon: Icons.info_outline_rounded,
        message:
            'Calls and messages use installed apps. Support does not dispatch emergency responders. An exited account needs manual administrator review before rejoining.',
      ),
    ];
  }

  String _summary(Map<String, dynamic> v) => [
    v['holder_name'],
    v['upi'],
    v['account_number'],
    v['ifsc'],
  ].where((v) => v != null).join('\n');
}
