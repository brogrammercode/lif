import 'dart:async';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';
import 'package:user/features/partner_program/widgets/partner_document.dart';

class PartnerProgramPage extends StatefulWidget {
  const PartnerProgramPage({super.key});
  @override
  State<PartnerProgramPage> createState() => _PartnerProgramPageState();
}

class _PartnerProgramPageState extends State<PartnerProgramPage>
    with WidgetsBindingObserver {
  final _repository = PartnerProgramRepository();
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _signature = TextEditingController();
  final Map<String, TextEditingController> _controllers = {};
  final Map<String, dynamic> _values = {};
  final Map<String, List<_PartnerFile>> _files = {};
  Map<String, dynamic>? _workflow;
  bool _loading = true;
  bool _saving = false;
  bool _acceptPolicy = false;
  bool _acceptConfirmation = false;
  bool _showForm = false;
  bool _dirty = false;
  String? _error;
  Timer? _poll;
  int _loadRequest = 0;
  Map<String, dynamic>? get _application =>
      _workflow?['application'] as Map<String, dynamic>?;
  String get _status => '${_application?['status'] ?? ''}';
  List<Map<String, dynamic>> get _definitions =>
      _maps(_workflow?['requirements']);
  List<Map<String, dynamic>> get _answers => _maps(_application?['fields']);
  List<Map<String, dynamic>> _maps(dynamic value) => (value as List? ?? [])
      .map((item) => Map<String, dynamic>.from(item as Map))
      .toList();
  Map<String, dynamic>? _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : null;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
    _poll = Timer.periodic(const Duration(seconds: 20), (_) {
      if (!_dirty &&
          !_saving &&
          ['SUBMITTED', 'CONFIRMATION_SUBMITTED'].contains(_status)) {
        unawaited(_load(background: true));
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_dirty && !_saving) {
      unawaited(_load(background: true));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _email.dispose();
    _phone.dispose();
    _signature.dispose();
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load({bool background = false}) async {
    if (!mounted || (background && _loading)) return;
    final request = ++_loadRequest;
    if (!background) setState(() => _loading = true);
    try {
      final data = await _repository.workflow();
      String? email;
      String? phone;
      String? legalName;
      if (_workflow == null) {
        try {
          final user = await AuthRepository().currentUser();
          email = user.email;
          phone = user.phoneE164;
          legalName = user.displayName;
        } catch (_) {}
      }
      if (!mounted || request != _loadRequest || (background && _dirty)) return;
      final previousVersion = _map(_workflow?['policy'])?['version'];
      _workflow = data;
      if (_application == null &&
          previousVersion != null &&
          previousVersion != _map(data['policy'])?['version']) {
        _acceptPolicy = false;
        _showForm = false;
      }
      _email.text = '${_application?['contact_email'] ?? email ?? _email.text}';
      _phone.text =
          '${_application?['whatsapp_phone'] ?? phone ?? _phone.text}';
      _signature.text =
          '${_map(_application?['confirmation'])?['signature_name'] ?? legalName ?? _signature.text}';
      _values.clear();
      _files.clear();
      for (final definition in _definitions) {
        final id = '${definition['id']}';
        final answer = _answers
            .where((item) => item['requirement_id'] == id)
            .firstOrNull;
        final value = answer?['value'];
        _values[id] = value;
        final type = '${definition['field_type']}';
        if (['FILE', 'IMAGE', 'PDF'].contains(type)) {
          _files[id] = (value as List? ?? []).map((assetId) {
            final asset = _maps(
              data['assets'],
            ).where((a) => a['id'] == assetId).firstOrNull;
            return _PartnerFile(
              name: '${asset?['file_name'] ?? 'Document'}',
              assetId: '$assetId',
            );
          }).toList();
        } else {
          (_controllers[id] ??= TextEditingController()).text = value == null
              ? ''
              : '$value';
        }
      }
      setState(() {
        _loading = false;
        _error = null;
        _dirty = false;
        _acceptConfirmation = false;
      });
    } catch (error) {
      if (mounted && request == _loadRequest && !(background && _dirty)) {
        setState(() {
          _loading = false;
          _error = ApiResult.errorMessage(error);
        });
      }
    }
  }

  Future<void> _run(Future<void> Function() task) async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await task();
      if (mounted) {
        _dirty = false;
        await _load(background: true);
      }
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _markDirty() {
    if (!_dirty && mounted) setState(() => _dirty = true);
  }

  Future<void> _download(String id) async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await _repository.download(id);
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    for (final definition in _definitions) {
      final id = '${definition['id']}';
      if (['FILE', 'IMAGE', 'PDF'].contains(definition['field_type']) &&
          definition['is_required'] == true &&
          (_files[id]?.isEmpty ?? true)) {
        setState(
          () => _error = 'Upload ${definition['label']} before submitting.',
        );
        return;
      }
    }
    await _run(() async {
      final answers = <Map<String, dynamic>>[];
      for (final definition in _definitions) {
        final id = '${definition['id']}';
        final type = '${definition['field_type']}';
        dynamic value;
        if (['FILE', 'IMAGE', 'PDF'].contains(type)) {
          final selected = _files[id] ?? [];
          for (final file in selected) {
            if (file.assetId == null && file.bytes != null) {
              final uploaded = await _repository.upload(
                id,
                file.name,
                file.bytes!,
              );
              file.assetId = '${uploaded['id']}';
            }
          }
          value = selected.map((file) => file.assetId!).toSet().toList();
        } else if (type == 'BOOLEAN') {
          value = _values[id];
        } else {
          final text = _controllers[id]?.text.trim() ?? '';
          value = text.isEmpty
              ? null
              : type == 'NUMBER'
              ? num.tryParse(text)
              : text;
        }
        answers.add({'requirement_id': id, 'value': value});
      }
      final policy = _map(_workflow?['policy']);
      await _repository.submit({
        'version': _application?['version'] ?? 0,
        'policy_version': policy?['version'],
        'accepted': true,
        'contact_email': _email.text.trim(),
        'whatsapp_phone': _phone.text.trim(),
        'answers': answers,
      });
    });
  }

  Future<void> _pick(Map<String, dynamic> definition) async {
    try {
      final extensions = (definition['allowed_extensions'] as List? ?? [])
          .map((value) => '$value'.replaceFirst('.', '').toLowerCase())
          .toList();
      final type = '${definition['field_type']}';
      final allowed = extensions.isNotEmpty
          ? extensions
          : type == 'IMAGE'
          ? ['jpg', 'jpeg', 'png', 'webp']
          : type == 'PDF'
          ? ['pdf']
          : [
              'pdf',
              'jpg',
              'jpeg',
              'png',
              'webp',
              'txt',
              'csv',
              'doc',
              'docx',
              'xls',
              'xlsx',
              'zip',
            ];
      final List<PlatformFile> result;
      if (definition['allow_multiple'] == true) {
        result = await FilePicker.pickFiles(
          type: FileType.custom,
          allowedExtensions: allowed,
        );
      } else {
        final file = await FilePicker.pickFile(
          type: FileType.custom,
          allowedExtensions: allowed,
        );
        result = file == null ? [] : [file];
      }
      if (result.isEmpty || !mounted) return;
      final limit =
          ((definition['max_file_size_mb'] as num?)?.toDouble() ?? 3) *
          1024 *
          1024;
      final picked = <_PartnerFile>[];
      for (final file in result) {
        final size = await file.length();
        if (size == null || size > 3000000 || size > limit) {
          throw StateError(
            'Choose files within the configured size limit and no larger than 3 MB.',
          );
        }
        final bytes = await file.readAsBytes();
        if (bytes.length > 3000000 || bytes.length > limit || bytes.isEmpty) {
          throw StateError('Choose a nonempty file within the size limit.');
        }
        picked.add(_PartnerFile(name: file.name, bytes: bytes));
      }
      if (!mounted) return;
      final selected = definition['allow_multiple'] == true
          ? [...?_files['${definition['id']}'], ...picked]
          : picked;
      if (selected.length > 10) {
        throw StateError('Choose at most 10 files for one field.');
      }
      setState(() {
        _files['${definition['id']}'] = selected;
        _dirty = true;
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    }
  }

  Future<bool> _discard() async =>
      await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Discard unsaved changes?'),
          content: const Text(
            'Your selected files and unsaved form changes will be discarded.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Keep editing'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Discard'),
            ),
          ],
        ),
      ) ??
      false;
  Widget _statusBadge(String status) {
    final rejected = status == 'REJECTED' || status.contains('CHANGES');
    final approved = ['APPROVED', 'COMPLETED', 'ACTIVATED'].contains(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color:
            (rejected
                    ? AppColors.googleRed
                    : approved
                    ? AppColors.primaryGreen
                    : AppColors.gold)
                .withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        status.toLowerCase().replaceAll('_', ' '),
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: rejected
              ? AppColors.googleRed
              : approved
              ? AppColors.primaryGreen
              : AppColors.goldDark,
        ),
      ),
    );
  }

  Widget _field(Map<String, dynamic> definition, bool editing) {
    final id = '${definition['id']}';
    final type = '${definition['field_type']}';
    final required = definition['is_required'] == true;
    final answer = _answers
        .where((item) => item['requirement_id'] == id)
        .firstOrNull;
    final enabled = editing && !_saving && answer?['status'] != 'APPROVED';
    final label = '${definition['label']}${required ? ' *' : ''}';
    final children = <Widget>[
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
            ),
          ),
          if (answer != null) _statusBadge('${answer['status']}'),
        ],
      ),
      if ('${definition['description'] ?? ''}'.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(
            '${definition['description']}',
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
        ),
      const SizedBox(height: 12),
    ];
    if (['FILE', 'IMAGE', 'PDF'].contains(type)) {
      final files = _files[id] ?? [];
      for (final file in files) {
        children.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (type == 'IMAGE' && file.bytes != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.memory(
                      file.bytes!,
                      height: 140,
                      width: double.infinity,
                      fit: BoxFit.contain,
                      errorBuilder: (_, error, stack) =>
                          const Icon(Icons.broken_image_outlined),
                    ),
                  ),
                Row(
                  children: [
                    const Icon(
                      Icons.description_outlined,
                      color: AppColors.primaryGreen,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(file.name, overflow: TextOverflow.ellipsis),
                    ),
                    if (file.assetId != null)
                      IconButton(
                        tooltip: 'Download file',
                        onPressed: _saving
                            ? null
                            : () => _download(file.assetId!),
                        icon: const Icon(Icons.download_outlined),
                      ),
                    if (enabled)
                      IconButton(
                        tooltip: 'Remove selected file',
                        onPressed: () => setState(() {
                          files.remove(file);
                          _dirty = true;
                        }),
                        icon: const Icon(Icons.close),
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      }
      if (enabled) {
        children.add(
          OutlinedButton.icon(
            onPressed: () => _pick(definition),
            icon: const Icon(Icons.upload_file),
            label: Text(files.isEmpty ? 'Choose files' : 'Add / replace files'),
          ),
        );
      }
      children.add(
        Text(
          'Files are uploaded when you submit. Maximum 3 MB per file${definition['max_file_size_mb'] != null ? ' or the configured ${definition['max_file_size_mb']} MB limit, whichever is smaller' : ''}.',
          style: const TextStyle(fontSize: 11, color: AppColors.textTertiary),
        ),
      );
    } else if (type == 'BOOLEAN') {
      children.add(
        DropdownButtonFormField<bool>(
          key: ValueKey('$id-${_values[id]}-$enabled'),
          initialValue: _values[id] as bool?,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            hintText: 'Choose yes or no',
          ),
          items: const [
            DropdownMenuItem(value: true, child: Text('Yes')),
            DropdownMenuItem(value: false, child: Text('No')),
          ],
          onChanged: enabled
              ? (value) => setState(() {
                  _values[id] = value;
                  _dirty = true;
                })
              : null,
          validator: (value) =>
              required && value == null ? 'Choose yes or no.' : null,
        ),
      );
    } else {
      children.add(
        TextFormField(
          controller: _controllers[id],
          enabled: enabled,
          readOnly: type == 'DATE',
          maxLines: type == 'TEXT' ? 4 : 1,
          keyboardType: type == 'NUMBER'
              ? const TextInputType.numberWithOptions(
                  decimal: true,
                  signed: true,
                )
              : TextInputType.text,
          decoration: InputDecoration(
            border: const OutlineInputBorder(),
            hintText: '${definition['placeholder'] ?? ''}',
            suffixIcon: type == 'DATE'
                ? const Icon(Icons.calendar_today_outlined)
                : null,
          ),
          onChanged: (_) => _markDirty(),
          onTap: type == 'DATE' && enabled
              ? () async {
                  final parsed = DateTime.tryParse(
                    _controllers[id]?.text ?? '',
                  );
                  final date = await showDatePicker(
                    context: context,
                    initialDate: parsed ?? DateTime.now(),
                    firstDate: DateTime(1900),
                    lastDate: DateTime(2100),
                  );
                  if (date != null && mounted) {
                    setState(() {
                      _controllers[id]!.text = date.toIso8601String().substring(
                        0,
                        10,
                      );
                      _dirty = true;
                    });
                  }
                }
              : null,
          validator: (value) {
            final text = value?.trim() ?? '';
            if (required && text.isEmpty) return 'This field is required.';
            if (text.isEmpty) return null;
            if (definition['max_length'] != null &&
                text.length > (definition['max_length'] as num)) {
              return 'Maximum ${definition['max_length']} characters.';
            }
            if (type == 'NUMBER') {
              final number = num.tryParse(text);
              if (number == null || !number.isFinite) {
                return 'Enter a valid number.';
              }
              if (definition['min_value'] != null &&
                  number < (definition['min_value'] as num)) {
                return 'Minimum ${definition['min_value']}.';
              }
              if (definition['max_value'] != null &&
                  number > (definition['max_value'] as num)) {
                return 'Maximum ${definition['max_value']}.';
              }
            }
            return null;
          },
        ),
      );
    }
    if (answer?['status'] == 'REJECTED') {
      children.add(
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text(
            'Correction required: ${answer?['rejection_reason'] ?? ''}',
            style: const TextStyle(
              color: AppColors.googleRed,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: children,
        ),
      ),
    );
  }

  List<Widget> _formContents() {
    final editing = _application == null || _status == 'CHANGES_REQUESTED';
    final widgets = <Widget>[
      if (_application != null)
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _statusBadge(_status),
              const SizedBox(height: 10),
              Text(
                _status == 'CHANGES_REQUESTED'
                    ? 'Please correct the rejected fields below. Approved fields are preserved.'
                    : 'Your application is under review. Each field’s status and feedback appear below.',
                style: const TextStyle(
                  height: 1.5,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      const SizedBox(height: 16),
      const AppSectionLabel('Contact and delivery'),
      const SizedBox(height: 10),
      AppCard(
        child: Column(
          children: [
            TextFormField(
              controller: _email,
              enabled: editing && !_saving,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Email for final PDF *',
                border: OutlineInputBorder(),
              ),
              onChanged: (_) => _markDirty(),
              validator: (value) =>
                  RegExp(
                    r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                  ).hasMatch(value?.trim() ?? '')
                  ? null
                  : 'Enter a valid email address.',
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _phone,
              enabled: editing && !_saving,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'WhatsApp number with country code *',
                hintText: '+919876543210',
                border: OutlineInputBorder(),
              ),
              onChanged: (_) => _markDirty(),
              validator: (value) =>
                  RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(value?.trim() ?? '')
                  ? null
                  : 'Include + and your country code.',
            ),
            const SizedBox(height: 8),
            const Text(
              'Your administrator will review these contacts before sharing your final document.',
              style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
            ),
          ],
        ),
      ),
      const SizedBox(height: 20),
    ];
    String? category;
    for (final definition in _definitions) {
      final current =
          '${_map(definition['category'])?['name'] ?? 'Requirements'}';
      if (current != category) {
        category = current;
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(top: 6, bottom: 12),
            child: AppSectionLabel(current),
          ),
        );
      }
      widgets.add(_field(definition, editing));
    }
    if (editing) {
      widgets.add(
        AppButton(
          text: _application == null
              ? 'Submit application'
              : 'Submit corrections',
          onPressed: _saving ? null : _submit,
          isLoading: _saving,
        ),
      );
    } else {
      widgets.add(
        OutlinedButton.icon(
          onPressed: _saving ? null : () => _load(),
          icon: const Icon(Icons.refresh),
          label: const Text('Refresh review status'),
        ),
      );
    }
    if (_workflow?['policy'] != null) {
      widgets.add(
        ExpansionTile(
          title: const Text('Read accepted policy'),
          children: [PartnerDocument(document: _map(_workflow!['policy'])!)],
        ),
      );
    }
    return widgets;
  }

  List<Widget> _contents() {
    if (_workflow == null) return [];
    if (['COMPLETED', 'ACTIVATED'].contains(_status)) {
      return [
        const SizedBox(height: 20),
        const Icon(
          Icons.verified_outlined,
          size: 72,
          color: AppColors.primaryGreen,
        ),
        const SizedBox(height: 20),
        const Text(
          'Welcome to the Partner Program',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
        const Text(
          'Your application and confirmation are fully approved. Your final document is ready below.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.textSecondary, height: 1.5),
        ),
        const SizedBox(height: 24),
        AppButton(
          text: 'Download final PDF',
          icon: const Icon(Icons.download_outlined),
          isLoading: _saving,
          onPressed: _saving
              ? null
              : () => _run(
                  () =>
                      _repository.download('${_application!['final_pdf_id']}'),
                ),
        ),
        const SizedBox(height: 14),
        AppButton(
          text: _status == 'ACTIVATED'
              ? 'Go to driver home'
              : 'Sign out and re-login as Driver',
          backgroundColor: AppColors.deepOnyx,
          borderColor: AppColors.deepOnyx,
          onPressed: _saving
              ? null
              : () async {
                  if (_status == 'ACTIVATED') {
                    Navigator.pushNamedAndRemoveUntil(
                      context,
                      AppRoutes.driverHome,
                      (_) => false,
                    );
                    return;
                  }
                  await AuthRepository().signOut();
                  if (mounted) {
                    Navigator.pushNamedAndRemoveUntil(
                      context,
                      AppRoutes.login,
                      (_) => false,
                    );
                  }
                },
        ),
        const SizedBox(height: 12),
        const Text(
          'Your first fresh login generates an activation code for your administrator to send manually. Verify that code once; later logins open your driver home directly.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: AppColors.textTertiary,
            height: 1.5,
          ),
        ),
      ];
    }
    if ([
      'APPROVED',
      'CONFIRMATION_SUBMITTED',
      'CONFIRMATION_CHANGES_REQUESTED',
    ].contains(_status)) {
      final confirmation = _map(_workflow!['confirmation']);
      final pending = _status == 'CONFIRMATION_SUBMITTED';
      final rejection = _map(
        _application?['confirmation'],
      )?['rejection_reason'];
      return [
        _statusBadge(_status),
        const SizedBox(height: 16),
        if (confirmation != null) PartnerDocument(document: confirmation),
        const SizedBox(height: 16),
        if (rejection != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              'Correction required: $rejection',
              style: const TextStyle(color: AppColors.googleRed),
            ),
          ),
        if (pending)
          const AppCard(
            child: Text(
              'Your confirmation is with the administrator. We’ll show your final PDF here once it is approved.',
              style: TextStyle(height: 1.5),
            ),
          ),
        if (!pending) ...[
          TextFormField(
            controller: _signature,
            enabled: !_saving,
            decoration: const InputDecoration(
              labelText: 'Your full legal name *',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => _markDirty(),
            validator: (value) => (value?.trim().length ?? 0) >= 2
                ? null
                : 'Enter your full legal name.',
          ),
          const SizedBox(height: 12),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _acceptConfirmation,
            onChanged: _saving
                ? null
                : (value) => setState(() {
                    _acceptConfirmation = value ?? false;
                    _dirty = true;
                  }),
            title: const Text(
              'I have read this confirmation and accept it in my own name.',
            ),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: AppColors.primaryGreen,
          ),
          AppButton(
            text: 'Submit confirmation',
            isLoading: _saving,
            onPressed: !_acceptConfirmation || _saving
                ? null
                : () {
                    if (!(_form.currentState?.validate() ?? false)) return;
                    _run(
                      () => _repository.confirm({
                        'version': _application!['version'],
                        'document_version': confirmation?['version'],
                        'signature_name': _signature.text.trim(),
                        'accepted': true,
                      }),
                    );
                  },
          ),
        ],
        const SizedBox(height: 12),
        TextButton.icon(
          onPressed: _saving ? null : () => _load(),
          icon: const Icon(Icons.refresh),
          label: const Text('Refresh status'),
        ),
      ];
    }
    if (_application == null && !_showForm) {
      final policy = _map(_workflow!['policy']);
      if (policy == null) {
        return [
          const AppEmptyState(
            icon: Icons.description_outlined,
            title: 'Partner Program is being prepared',
            subtitle:
                'The policy has not been published yet. Please check back shortly.',
          ),
          TextButton(onPressed: () => _load(), child: const Text('Refresh')),
        ];
      }
      return [
        PartnerDocument(document: policy),
        const SizedBox(height: 16),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _acceptPolicy,
          onChanged: (value) => setState(() => _acceptPolicy = value ?? false),
          controlAffinity: ListTileControlAffinity.leading,
          activeColor: AppColors.primaryGreen,
          title: const Text(
            'I have read the policy and agree to apply for the Partner Program.',
          ),
        ),
        const SizedBox(height: 12),
        AppButton(
          text: 'Continue to application',
          onPressed: _acceptPolicy
              ? () => setState(() => _showForm = true)
              : null,
        ),
      ];
    }
    return _formContents();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_dirty && !_saving,
    onPopInvokedWithResult: (didPop, result) async {
      if (didPop || _saving) return;
      if (await _discard() && context.mounted) Navigator.pop(context);
    },
    child: AppPage(
      title: 'Partner Program',
      action: IconButton(
        tooltip: 'Refresh partner status',
        onPressed: _saving
            ? null
            : () async {
                if (_dirty && !await _discard()) return;
                _load();
              },
        icon: const Icon(Icons.refresh),
      ),
      child: _loading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primaryGreen),
            )
          : _workflow == null
          ? AppLoadError(
              message: _error ?? 'Could not load Partner Program.',
              onRetry: () => _load(),
            )
          : RefreshIndicator(
              onRefresh: () async {
                if (!_dirty) await _load(background: true);
              },
              color: AppColors.primaryGreen,
              child: Form(
                key: _form,
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 32),
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Text(
                          _error!,
                          style: const TextStyle(color: AppColors.googleRed),
                        ),
                      ),
                    ..._contents(),
                  ],
                ),
              ),
            ),
    ),
  );
}

class _PartnerFile {
  final String name;
  final Uint8List? bytes;
  String? assetId;
  _PartnerFile({required this.name, this.bytes, this.assetId});
}
