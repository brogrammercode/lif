import 'package:user/components/ui/app_error_snackbar.dart';
import 'package:user/features/rides/ride_display.dart' show rideMoney, rideTime;
import 'package:user/features/partner_program/controllers/driver_exit_controller.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';
import 'package:user/core/routes.dart';

class DriverExitPage extends StatefulWidget {
  final PartnerProgramRepository? repository;
  final bool historyOnly;
  const DriverExitPage({super.key, this.repository, this.historyOnly = false});
  @override
  State<DriverExitPage> createState() => _DriverExitPageState();
}

class _DriverExitPageState extends State<DriverExitPage>
    with WidgetsBindingObserver {
  late final _controller = DriverExitController(
    widget.repository ?? PartnerProgramRepository(),
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  PartnerProgramRepository get _repo => _controller.repo;
  final _form = GlobalKey<FormState>();
  final _reason = TextEditingController();
  Map<String, dynamic>? get _request => _controller.request;
  bool get _loading => _controller.loading;
  bool get _saving => _controller.saving;
  set _saving(bool value) => _controller.saving = value;
  bool _confirming = false;
  set _refreshing(bool value) => _controller.refreshing = value;
  String? get _error => _controller.error;
  set _error(String? value) => _controller.error = value;
  Timer? _poll;
  int get _loadRevision => _controller.loadRevision;
  set _loadRevision(int value) => _controller.loadRevision = value;
  @override
  void initState() {
    super.initState();
    if (widget.historyOnly) {
      unawaited(_controller.loadSettlements());
      return;
    }
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
    _poll = Timer.periodic(const Duration(seconds: 20), (_) {
      if (!_saving &&
          !_loading &&
          ['REQUESTED', 'REVIEWING'].contains(_request?['status'])) {
        unawaited(_load(background: true));
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_saving) {
      unawaited(_load(background: true));
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load({bool background = false, bool force = false}) =>
      _controller.load(background: background, force: force);

  Future<void> _submit() async {
    if (_saving || _confirming || !(_form.currentState?.validate() ?? false)) {
      return;
    }
    _confirming = true;
    final reason = _reason.text.trim();
    final version = (_request?['version'] as num?)?.toInt() ?? 0;
    bool? confirmed;
    try {
      confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => LiquidGlassDialog(
          title: const Text('Request partner exit?'),
          content: const Text(
            'Your administrator will review your request, record any dues and issue a settlement PDF. Driver operations will be disabled when the exit is completed.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Submit request'),
            ),
          ],
        ),
      );
    } finally {
      _confirming = false;
    }
    if (confirmed != true || !mounted || _saving) return;
    setState(() {
      ++_loadRevision;
      _saving = true;
      _error = null;
    });
    try {
      await _repo.requestExit(reason, version);
      if (mounted) {
        _reason.clear();
        await _load(background: true, force: true);
      }
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
          _refreshing = false;
        });
      }
    }
  }

  Future<void> _download(String id) async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await _repo.download(id);
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _history() => AppPage(
    title: 'Past Driver Settlements',
    child: ListView(
      padding: const EdgeInsets.symmetric(vertical: 16),
      children: [
        if (_controller.loadingSettlements && _controller.settlements.isEmpty)
          const LiquidGlassFormSkeleton(),
        if (_controller.settlementError case final error?)
          AppLoadError(message: error, onRetry: _controller.loadSettlements),
        if (_error case final error?) AppErrorNotice(message: error),
        if (!_controller.loadingSettlements &&
            _controller.settlements.isEmpty &&
            _controller.settlementError == null)
          const Text('No completed settlements yet.'),
        for (final row in _controller.settlements)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(rideTime(row['completed_at'])),
                  const SizedBox(height: 8),
                  Text(switch (row['dues_direction']) {
                    'DRIVER_OWES' =>
                      '${rideMoney(row['dues_amount'])} payable by you',
                    'PAYABLE_TO_DRIVER' =>
                      '${rideMoney(row['dues_amount'])} payable to you',
                    _ => 'No outstanding dues',
                  }),
                  if (row['settlement_pdf_id'] case final String id)
                    TextButton(
                      onPressed: _saving ? null : () => _download(id),
                      child: const Text('Download settlement PDF'),
                    ),
                  if ((row['application'] as Map?)?['final_pdf_id']
                      case final String id)
                    TextButton(
                      onPressed: _saving ? null : () => _download(id),
                      child: const Text('Download partner agreement'),
                    ),
                ],
              ),
            ),
          ),
        if (_controller.nextSettlementCursor != null)
          TextButton(
            onPressed: _controller.loadingSettlements
                ? null
                : () => _controller.loadSettlements(more: true),
            child: const Text('Load older settlements'),
          ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) =>
      widget.historyOnly ? _history() : _exitRequest();

  Widget _exitRequest() => AppPage(
    glass: true,
    title: 'Exit Request & Dues',
    action: IconButton(
      tooltip: 'Refresh request',
      onPressed: _saving || _loading ? null : _load,
      icon: const Icon(Icons.refresh),
    ),
    child: _loading
        ? const LiquidGlassFormSkeleton()
        : _error != null && _request == null
        ? AppLoadError(message: _error!, onRetry: _load)
        : Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                DriverPageIntro(
                  icon: Icons.logout_rounded,
                  title: _request?['status'] == 'COMPLETED'
                      ? 'Exit completed'
                      : 'Exit and settlement',
                  description:
                      'Review the complete status, dues and settlement document in one place.',
                ),
                const SizedBox(height: 16),
                if (_error != null) AppErrorNotice(message: _error),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.description_outlined,
                        color: AppColors.primaryGreen,
                        size: 32,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _request?['status'] == 'COMPLETED'
                            ? 'Your partner exit is complete'
                            : 'Partner exit & settlement',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _request?['status'] == 'COMPLETED'
                            ? 'You can keep using this account as a rider. Your driver ride history and settlement document remain available.'
                            : 'We will review your exit request and share a settlement document after recording your dues.',
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          height: 1.5,
                        ),
                      ),
                      if (_request != null) ...[
                        const SizedBox(height: 16),
                        DriverStatusPill(
                          label: '${_request!['status']}'.replaceAll('_', ' '),
                          status: '${_request!['status']}',
                        ),
                        const SizedBox(height: 8),
                        Text('${_request!['reason']}'),
                        if (_request!['dues_amount'] != null) ...[
                          const Divider(height: 32),
                          Text(
                            rideMoney(
                              _request!['dues_amount'],
                              currency: '${_request!['currency'] ?? 'INR'}',
                            ),
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(switch (_request!['dues_direction']) {
                            'DRIVER_OWES' => 'Amount payable by you',
                            'PAYABLE_TO_DRIVER' => 'Amount payable to you',
                            _ => 'No outstanding dues',
                          }),
                          const SizedBox(height: 8),
                          const Text(
                            'This is your recorded settlement balance. Refer to the PDF for payment and settlement details.',
                            style: TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                if (_request?['status'] == 'COMPLETED' &&
                    _request?['settlement_pdf_id'] != null)
                  AppButton(
                    text: 'Download settlement PDF',
                    icon: const Icon(Icons.download),
                    onPressed: _saving
                        ? null
                        : () => _download(
                            _request!['settlement_pdf_id'] as String,
                          ),
                    isLoading: _saving,
                  ),
                if (_request?['status'] == 'COMPLETED')
                  TextButton(
                    onPressed: _saving
                        ? null
                        : () => Navigator.pushNamedAndRemoveUntil(
                            context,
                            AppRoutes.gate,
                            (_) => false,
                          ),
                    child: const Text('Return to Rider Home'),
                  ),
                if (_request == null || _request?['status'] == 'REJECTED') ...[
                  if (_request?['rejection_reason'] != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: DriverNotice(
                        icon: Icons.info_outline_rounded,
                        message:
                            'Please correct your request: ${_request!['rejection_reason']}',
                        error: true,
                      ),
                    ),
                  AppCard(
                    child: TextFormField(
                      controller: _reason,
                      enabled: !_saving,
                      onChanged: (_) => setState(() {}),
                      maxLines: 5,
                      maxLength: 2000,
                      decoration: const InputDecoration(
                        labelText: 'Reason for exit',
                        hintText:
                            'Tell us why you would like to leave the Partner Program.',
                        border: GlassTokens.inputBorder,
                      ),
                      validator: (value) => (value?.trim().length ?? 0) < 10
                          ? 'Give a reason of at least 10 characters.'
                          : null,
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (_reason.text.trim().isNotEmpty)
                    AppButton(
                      text: _request == null
                          ? 'Request partner exit'
                          : 'Resubmit request',
                      onPressed: _saving ? null : _submit,
                      isLoading: _saving,
                    ),
                ],
              ],
            ),
          ),
  );
}
