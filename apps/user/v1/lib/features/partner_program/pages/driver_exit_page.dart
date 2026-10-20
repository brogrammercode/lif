import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';

class DriverExitPage extends StatefulWidget {
  const DriverExitPage({super.key});
  @override
  State<DriverExitPage> createState() => _DriverExitPageState();
}

class _DriverExitPageState extends State<DriverExitPage>
    with WidgetsBindingObserver {
  final _repo = PartnerProgramRepository();
  final _form = GlobalKey<FormState>();
  final _reason = TextEditingController();
  Map<String, dynamic>? _request;
  bool _loading = true;
  bool _saving = false;
  bool _confirming = false;
  bool _refreshing = false;
  String? _error;
  Timer? _poll;
  int _loadRevision = 0;
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
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load({bool background = false, bool force = false}) async {
    if (!mounted || (_refreshing && !force)) return;
    final revision = ++_loadRevision;
    _refreshing = true;
    if (!background) setState(() => _loading = true);
    try {
      final data = await _repo.exitRequest();
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _request = data;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (mounted && revision == _loadRevision) {
        setState(() {
          _loading = false;
          _error = ApiResult.errorMessage(error);
        });
      }
    } finally {
      if (revision == _loadRevision) _refreshing = false;
    }
  }

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
        builder: (context) => AlertDialog(
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
    title: 'Exit Request & Dues',
    action: IconButton(
      tooltip: 'Refresh request',
      onPressed: _saving || _loading ? null : _load,
      icon: const Icon(Icons.refresh),
    ),
    child: _loading
        ? const Center(
            child: CircularProgressIndicator(color: AppColors.primaryGreen),
          )
        : _error != null && _request == null
        ? AppLoadError(message: _error!, onRetry: _load)
        : Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Colors.red),
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
                          fontWeight: FontWeight.w800,
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
                        Text(
                          'Status: ${'${_request!['status']}'.toLowerCase().replaceAll('_', ' ')}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 8),
                        Text('${_request!['reason']}'),
                        if (_request!['dues_amount'] != null) ...[
                          const Divider(height: 32),
                          Text(
                            '${_request!['currency']} ${_request!['dues_amount']}',
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
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
                      child: AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Please correct your request',
                              style: TextStyle(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 8),
                            Text('${_request!['rejection_reason']}'),
                          ],
                        ),
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
                        border: OutlineInputBorder(),
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
