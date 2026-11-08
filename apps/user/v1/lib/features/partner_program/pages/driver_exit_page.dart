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

class DriverExitPage extends StatefulWidget {
  final PartnerProgramRepository? repository;
  const DriverExitPage({super.key, this.repository});
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

  Future<void> _download() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await _repo.download('${_request!['settlement_pdf_id']}');
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
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
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: DriverNotice(
                      icon: Icons.sync_problem_rounded,
                      message: _error!,
                      error: true,
                    ),
                  ),
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
                            ? 'Driver operations are disabled. Your account, ride history and settlement document remain available.'
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
                            '${_request!['currency']} ${_request!['dues_amount']}',
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
                    onPressed: _saving ? null : _download,
                    isLoading: _saving,
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
