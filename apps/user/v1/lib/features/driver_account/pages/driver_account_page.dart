import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_account/driver_account.repo.dart';
import 'package:user/features/driver_account/pages/driver_documents_page.dart';
import 'package:user/features/driver_account/widgets/payout_change_form.dart';
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
  late final repo = widget.repository ?? DriverAccountRepository();
  Map<String, dynamic>? _data, _requests;
  String? _error;
  int _tab = 0, _page = 1;
  bool _loading = false, _busy = false;
  bool get _exited => _data?['exited'] == true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
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

  Future<void> _load() async {
    if (_loading || !mounted) return;
    setState(() => _loading = true);
    try {
      final data = await repo.account();
      if (!mounted) return;
      setState(() => _data = data);
      final requests = _tab == 2 ? await repo.requests(page: _page) : null;
      if (!mounted) return;
      setState(() {
        _data = data;
        _requests = requests;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

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

  Widget _link(String title, String route) => ListTile(
    title: Text(title),
    trailing: const Icon(Icons.chevron_right),
    onTap: () async {
      await Navigator.pushNamed(context, route);
      if (mounted) await _load();
    },
  );
  @override
  Widget build(BuildContext context) => AppPage(
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
              ChoiceChip(
                label: Text(e.value),
                selected: _tab == e.key,
                onSelected: _loading
                    ? null
                    : (_) {
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
        if (_loading && _data != null) const LinearProgressIndicator(),
        if (_error != null && _data != null)
          TextButton(onPressed: _load, child: Text('$_error - Retry')),
        Expanded(
          child: _data == null
              ? (_loading
                    ? const Center(child: CircularProgressIndicator())
                    : AppLoadError(
                        message: _error ?? 'Account unavailable',
                        onRetry: _load,
                      ))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.symmetric(vertical: 16),
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
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Your driver account',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              Text('Partner: ${app['status'] ?? 'Not applied'}'),
              Text('Verification: ${driver['verification_status']}'),
              Text('Availability: ${driver['availability']}'),
              SelectableText('Driver ID ${driver['id']}'),
              if (_exited)
                const Text(
                  'Exit complete. Driving is disabled. Your statements, settlement PDF and support remain available.',
                ),
              if (driver['availability'] == 'SUSPENDED')
                const Text(
                  'Driving is suspended. Contact Support to resolve the restriction; statements and documents remain accessible.',
                ),
            ],
          ),
        ),
        _link('Earnings & transactions', AppRoutes.driverFinances),
        ListTile(
          title: const Text('Vehicles & reviewed documents'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => DriverDocumentsPage(readOnly: _exited),
            ),
          ),
        ),
        _link('Personal profile', AppRoutes.profile),
        _link(
          'Partner application & final agreement',
          AppRoutes.partnerProgram,
        ),
        _link('Exit request & settlement PDF', AppRoutes.driverExit),
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
        const AppSectionLabel('Application review'),
        for (final field in rideMaps(app['fields']))
          ListTile(
            dense: true,
            title: Text(
              '${rideMap(field['definition'])['label'] ?? 'Document'}',
            ),
            subtitle: Text(
              '${field['status']}${field['rejection_reason'] == null ? '' : ' - ${field['rejection_reason']}'}',
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
        const Text(
          'Ordinary profile changes are separate from reviewed KYC. Contact Support for legal identity/document corrections. Documents are reviewed manually; no automatic expiry rule is applied.',
        ),
      ];
    }
    if (_tab == 1) {
      return [
        const Text(
          'Reviewed payment destination',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
        ),
        const Text(
          'Cash and direct UPI go to you. There is no platform wallet or automatic payout. A change takes effect after admin approval; recorded receipts keep their original destination.',
        ),
        AppCard(
          child: Text(
            _data!['approved_payout'] == null
                ? (rideMaps(_data!['initial_payout']).isEmpty
                      ? 'No reviewed destination is configured. Submit an account change for review.'
                      : rideMaps(_data!['initial_payout'])
                            .map((v) => '${v['label']}: ${v['display']}')
                            .join('\n'))
                : _summary(
                    rideMap(rideMap(_data!['approved_payout'])['summary']),
                  ),
          ),
        ),
        FilledButton(
          onPressed:
              _loading ||
                  _busy ||
                  _exited ||
                  rideMaps(
                    _data!['payout_changes'],
                  ).any((v) => v['status'] == 'PENDING')
              ? null
              : _change,
          child: const Text('Request account change'),
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
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Text(_summary(rideMap(row['summary']))),
                  if (row['rejection_reason'] != null)
                    Text('${row['rejection_reason']}'),
                ],
              ),
            ),
          ),
      ];
    }
    if (_tab == 2) {
      return [
        const Text(
          'Your brand & model requests',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
        ),
        const Text(
          'Only your own rejected suggestions can be corrected. Corrections return to Requested. Duplicate names need manual admin resolution.',
        ),
        if (_loading) const LinearProgressIndicator(),
        for (final model in [false, true]) ...[
          AppSectionLabel(model ? 'Models' : 'Brands'),
          for (final row in rideMaps(_requests?[model ? 'models' : 'brands']))
            AppCard(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${row['name']}'),
                subtitle: Text(
                  '${row['status']}${row['rejection_reason'] == null ? '' : ' - ${row['rejection_reason']}'}',
                ),
                trailing: !_exited && row['status'] == 'REJECTED'
                    ? TextButton(
                        onPressed: _loading ? null : () => _correct(row, model),
                        child: const Text('Correct'),
                      )
                    : null,
              ),
            ),
        ],
        if (_requests != null &&
            rideMaps(_requests!['brands']).isEmpty &&
            rideMaps(_requests!['models']).isEmpty)
          const Text('No requests on this page.'),
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
      const SupportContactCard(),
      _link('Emergency contacts', AppRoutes.emergencyContacts),
      _link('Support requests', AppRoutes.support),
      _link('Driver trip history', AppRoutes.driverRides),
      _link('Exit request & dues', AppRoutes.driverExit),
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
      const Text(
        'Calls and messages use your installed apps. Support does not dispatch emergency responders. An exited account needs manual administrator review before rejoining.',
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
