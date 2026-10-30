import 'package:user/components/ui/liquid_glass.dart';
import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:user/features/partner_program/partner_form_validation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/features/partner_program/widgets/partner_address_input.dart';
import 'package:user/features/partner_program/widgets/partner_upload_tile.dart';
import 'package:user/features/partner_program/partner_draft_store.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';
import 'package:user/features/partner_program/widgets/partner_document.dart';

class PartnerProgramPage extends StatefulWidget {
  final PartnerProgramRepository? repository;
  final Future<UserModel> Function()? currentUser;
  final Future<PartnerDraftStore> Function(String)? createDraftStore;
  final Future<List<PartnerLocalFile>?> Function(Map<String, dynamic>)?
  selectFiles;
  final Future<XFile?> Function()? captureSelfie;
  const PartnerProgramPage({
    super.key,
    this.repository,
    this.currentUser,
    this.createDraftStore,
    this.selectFiles,
    this.captureSelfie,
  });
  @override
  State<PartnerProgramPage> createState() => _PartnerProgramPageState();
}

class _PartnerProgramPageState extends State<PartnerProgramPage>
    with WidgetsBindingObserver {
  late final _repository = widget.repository ?? PartnerProgramRepository();
  final _form = GlobalKey<FormState>();
  final _scroll = ScrollController(keepScrollOffset: false);
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _signature = TextEditingController();
  final Map<String, TextEditingController> _controllers = {};
  final Map<String, dynamic> _values = {};
  final Map<String, List<PartnerLocalFile>> _files = {};
  PartnerDraftStore? _draftStore;
  Timer? _draftTimer;
  String? _uploadProgress;
  Map<String, dynamic>? _workflow;
  bool _loading = true;
  bool _saving = false;
  bool _capturingSelfie = false;
  bool _pickingFiles = false;
  bool _checkedLostSelfie = false;
  bool _acceptPolicy = false;
  bool _acceptConfirmation = false;
  bool _showForm = false;
  bool _dirty = false;
  bool _submissionCommitted = false;
  bool _needsSignIn = false;
  String? _error;
  Timer? _poll;
  int _loadRequest = 0;
  Map<String, dynamic>? get _application =>
      _workflow?['application'] as Map<String, dynamic>?;
  bool get _needsSelfie =>
      ['SUBMITTED', 'CHANGES_REQUESTED'].contains(_status) &&
      !_answers.any((a) => a['requirement_id'] == '__live_selfie__');
  String get _status => '${_application?['status'] ?? ''}';
  bool get _editingApplication =>
      !_submissionCommitted &&
      ((_application == null && _showForm) ||
          _status == 'CHANGES_REQUESTED' ||
          _needsSelfie);
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
    if (state != AppLifecycleState.resumed && _dirty) unawaited(_saveDraft());
    if (state == AppLifecycleState.resumed && !_dirty && !_saving) {
      unawaited(_load(background: true));
    }
  }

  @override
  void didHaveMemoryPressure() {
    for (final file in _files.values.expand((files) => files)) {
      if (file.path != null) {
        unawaited(PartnerUploadTile.previewFile(file.path!).evict());
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _draftTimer?.cancel();
    if (_dirty) unawaited(_saveDraft());
    _email.dispose();
    _phone.dispose();
    _signature.dispose();
    _scroll.dispose();
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    for (final files in _files.values) {
      for (final file in files) {
        if (file.path != null) {
          unawaited(PartnerUploadTile.previewFile(file.path!).evict());
        }
      }
    }
    super.dispose();
  }

  Future<void> _load({bool background = false}) async {
    if (!mounted || (background && _loading)) return;
    final request = ++_loadRequest;
    if (!background) setState(() => _loading = true);
    try {
      final data = await _repository.workflow();
      _validateWorkflow(data);
      String? email;
      String? phone;
      String? legalName;
      if (_workflow == null || _draftStore == null) {
        try {
          final user =
              await (widget.currentUser?.call() ??
                  AuthRepository().currentUser());
          _draftStore ??=
              await (widget.createDraftStore ?? PartnerDraftStore.create)(
                user.id,
              );
          email = user.email;
          phone = user.phoneE164;
          legalName = user.displayName;
        } catch (_) {}
      }
      final draft = await _readDraft(data);
      if (!mounted ||
          request != _loadRequest ||
          (background &&
              (_dirty || _saving || _pickingFiles || _capturingSelfie))) {
        return;
      }
      final incoming = _map(data['application']);
      final needsSelfie =
          ['SUBMITTED', 'CHANGES_REQUESTED'].contains(incoming?['status']) &&
          !_maps(
            incoming?['fields'],
          ).any((a) => a['requirement_id'] == '__live_selfie__');
      if (!background &&
          !_submissionCommitted &&
          incoming != null &&
          incoming['status'] != 'CHANGES_REQUESTED' &&
          !needsSelfie) {
        // A foreground load has hidden the form and the server confirms it is
        // saved. Retire its private draft; background readers never delete it.
        try {
          await _draftStore?.clear();
        } catch (_) {}
        if (!mounted || request != _loadRequest) return;
      }
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
      for (final files in _files.values) {
        for (final file in files) {
          if (file.path != null) {
            unawaited(PartnerUploadTile.previewFile(file.path!).evict());
          }
        }
      }
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
            return PartnerLocalFile(
              name: '${asset?['file_name'] ?? 'Document'}',
              assetId: '$assetId',
            );
          }).toList();
        } else {
          final text = value == null ? '' : '$value';
          (_controllers[id] ??= TextEditingController()).text =
              definition['input_kind'] == 'IFSC' &&
                  answer?['status'] != 'APPROVED'
              ? text.toUpperCase()
              : text;
        }
      }
      if (draft != null) _applyDraft(draft);
      setState(() {
        _loading = false;
        _error = null;
        _dirty = draft != null;
        _needsSignIn = false;
        _acceptConfirmation = false;
        if (_application != null) _submissionCommitted = false;
      });
      if (!_checkedLostSelfie) {
        _checkedLostSelfie = true;
        unawaited(_recoverSelfie());
      }
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
    // A status poll started before editing must not overwrite a saving draft.
    _loadRequest++;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await _saveDraft(required: true);
      // Detach preview widgets before allocating the first request payload.
      await WidgetsBinding.instance.endOfFrame;
      for (final file in _files.values.expand((files) => files)) {
        if (file.path != null) {
          await PartnerUploadTile.previewFile(file.path!).evict();
        }
      }
      await task();
      if (mounted) {
        _draftTimer?.cancel();
        if (_scroll.hasClients) _scroll.jumpTo(0);
        // Remove editable widgets before replacing controllers/files on reload.
        // In particular, a focused field must not outlive its saved draft.
        setState(() {
          _dirty = false;
          _loading = true;
        });
        await WidgetsBinding.instance.endOfFrame;
        try {
          await _draftStore?.clear();
        } catch (_) {
          // A local cleanup failure must not turn a committed submission into
          // an apparent server failure. The stale version is discarded on load.
        }
        if (mounted) await _load();
      }
    } catch (error) {
      if (mounted) {
        final authFailure =
            error is DioException &&
            (error.response?.statusCode == 401 ||
                error.type == DioExceptionType.cancel);
        final reference = error is DioException
            ? error.response?.headers['x-request-id']?.firstOrNull
            : null;
        final message = authFailure
            ? 'Your session has ended. Your draft and uploaded files are saved. Sign in again, then reopen Partner Program to continue.'
            : '${ApiResult.errorMessage(error)}${reference == null ? '' : '\nRequest reference: $reference'}';
        _needsSignIn = authFailure;
        setState(() => _error = message);
        ScaffoldMessenger.maybeOf(
          context,
        )?.showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
          _uploadProgress = null;
        });
        if (_error != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _scroll.hasClients) {
              unawaited(
                _scroll
                    .animateTo(
                      _scroll.position.maxScrollExtent,
                      duration: const Duration(milliseconds: 250),
                      curve: Curves.easeOut,
                    )
                    .then((_) {
                      if (mounted &&
                          _scroll.hasClients &&
                          _scroll.position.pixels >
                              _scroll.position.maxScrollExtent) {
                        _scroll.jumpTo(_scroll.position.maxScrollExtent);
                      }
                    }),
              );
            }
          });
        }
      }
    }
  }

  void _markDirty() {
    if (!_dirty && mounted) setState(() => _dirty = true);
    _scheduleDraft();
  }

  void _scheduleDraft() {
    _draftTimer?.cancel();
    _draftTimer = Timer(
      const Duration(milliseconds: 400),
      () => unawaited(_saveDraft()),
    );
  }

  Future<void> _saveDraft({bool required = false}) async {
    final store = _draftStore;
    if (!_dirty) return;
    const failure =
        'Local draft could not be saved. Keep this page open and check device storage.';
    if (store == null) {
      if (required) throw StateError(failure);
      return;
    }
    final snapshot = <String, dynamic>{
      'format': 1,
      'application_version': _application?['version'] ?? 0,
      'policy_version': _map(_workflow?['policy'])?['version'],
      'email': _email.text,
      'phone': _phone.text,
      'accepted': _acceptPolicy,
      'show_form': _showForm,
      'values': Map<String, dynamic>.from(_values),
      'text': {for (final e in _controllers.entries) e.key: e.value.text},
      'files': {
        for (final e in _files.entries)
          e.key: e.value.map((f) => f.toJson()).toList(),
      },
    };
    try {
      await store.save(snapshot);
    } catch (_) {
      if (mounted) {
        setState(() => _error = failure);
      }
      if (required) throw StateError(failure);
    }
  }

  Future<Map<String, dynamic>?> _readDraft(Map<String, dynamic> data) async {
    final store = _draftStore;
    if (store == null) return null;
    final app = _map(data['application']);
    final answers = _maps(app?['fields']);
    final needsSelfie =
        ['SUBMITTED', 'CHANGES_REQUESTED'].contains(app?['status']) &&
        !answers.any((a) => a['requirement_id'] == '__live_selfie__');
    if (app != null && app['status'] != 'CHANGES_REQUESTED' && !needsSelfie) {
      return null;
    }
    final draft = await store.read();
    if (draft == null ||
        draft['application_version'] != (app?['version'] ?? 0) ||
        draft['policy_version'] != _map(data['policy'])?['version']) {
      return null;
    }
    final assets = _maps(data['assets']).map((a) => '${a['id']}').toSet();
    final files = _map(draft['files']) ?? {};
    final restoredFiles = <String, List<PartnerLocalFile>>{};
    for (final definition in _maps(data['requirements'])) {
      final id = '${definition['id']}';
      if (files.containsKey(id) &&
          !answers.any(
            (a) => a['requirement_id'] == id && a['status'] == 'APPROVED',
          )) {
        restoredFiles[id] = await store.restoreFiles(files[id], assets);
      }
    }
    // Apply only after the caller checks that this load still owns the screen.
    // In particular, a delayed restore must never overwrite a saving draft.
    return {...draft, 'restored_files': restoredFiles};
  }

  void _applyDraft(Map<String, dynamic> draft) {
    final text = _map(draft['text']) ?? {};
    final values = _map(draft['values']) ?? {};
    final files =
        draft['restored_files'] as Map<String, List<PartnerLocalFile>>;
    for (final definition in _definitions) {
      final id = '${definition['id']}';
      if (_answers.any(
        (a) => a['requirement_id'] == id && a['status'] == 'APPROVED',
      )) {
        continue;
      }
      if (_controllers.containsKey(id) && text[id] is String) {
        _controllers[id]!.text = text[id] as String;
      }
      if (values.containsKey(id)) _values[id] = values[id];
      if (files.containsKey(id)) {
        _files[id] = files[id]!;
      }
    }
    if (draft['email'] is String) _email.text = draft['email'] as String;
    if (draft['phone'] is String) _phone.text = draft['phone'] as String;
    _acceptPolicy = draft['accepted'] == true;
    _showForm = draft['show_form'] == true && _acceptPolicy;
  }

  void _validateWorkflow(Map<String, dynamic> data) {
    const message =
        'Partner requirements could not be read. Refresh to try again.';
    bool object(dynamic item) =>
        item is Map && item.keys.every((key) => key is String);
    for (final key in ['requirements', 'assets']) {
      if (data[key] is! List ||
          (data[key] as List).any((item) => !object(item))) {
        throw const FormatException(message);
      }
    }
    final app = data['application'];
    if (app != null &&
        (app is! Map<String, dynamic> ||
            app['fields'] is! List ||
            (app['fields'] as List).any((item) => !object(item)))) {
      throw const FormatException(message);
    }
    final seen = <String>{};
    for (final field in _maps(data['requirements'])) {
      final id = field['id'];
      if (id is! String ||
          id.isEmpty ||
          !seen.add(id) ||
          field['label'] is! String ||
          ![
            'STRING',
            'TEXT',
            'NUMBER',
            'DATE',
            'BOOLEAN',
            'FILE',
            'IMAGE',
            'PDF',
          ].contains(field['field_type'])) {
        throw const FormatException(message);
      }
      final options = field['options'];
      if (options != null &&
          (options is! List ||
              options.any((v) => v is! String) ||
              options.toSet().length != options.length)) {
        throw const FormatException(message);
      }
    }
    for (final answer in _maps(_map(app)?['fields'])) {
      final field = _maps(
        data['requirements'],
      ).where((d) => d['id'] == answer['requirement_id']).firstOrNull;
      if (field != null &&
          ['FILE', 'IMAGE', 'PDF'].contains(field['field_type']) &&
          answer['value'] != null &&
          (answer['value'] is! List ||
              (answer['value'] as List).any((id) => id is! String))) {
        throw const FormatException(message);
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
      await _repository.download(id);
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _submit() async {
    if (_saving || _pickingFiles || _capturingSelfie) return;
    FocusManager.instance.primaryFocus?.unfocus();
    try {
      final values = <String, dynamic>{
        for (final definition in _definitions)
          '${definition['id']}':
              ['FILE', 'IMAGE', 'PDF'].contains(definition['field_type'])
              ? _files['${definition['id']}'] ?? []
              : definition['field_type'] == 'BOOLEAN'
              ? _values['${definition['id']}']
              : _controllers['${definition['id']}']?.text.trim(),
      };
      final error = validatePartnerDraft(
        // Approved snapshot values must remain valid under their original rules.
        _definitions
            .where(
              (d) => !_answers.any(
                (a) =>
                    a['requirement_id'] == d['id'] && a['status'] == 'APPROVED',
              ),
            )
            .toList(),
        values,
        email: _email.text,
        phone: _phone.text,
      );
      if (error != null) {
        setState(() => _error = error);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error)));
        return;
      }
      if (!(_form.currentState?.validate() ?? false)) return;
    } catch (error) {
      setState(
        () => _error =
            'The form could not be validated. Your draft is preserved. Refresh and try again.',
      );
      return;
    }
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
        final approved = _answers
            .where(
              (answer) =>
                  answer['requirement_id'] == id &&
                  answer['status'] == 'APPROVED',
            )
            .firstOrNull;
        if (approved != null) {
          answers.add({'requirement_id': id, 'value': approved['value']});
          continue;
        }
        final type = '${definition['field_type']}';
        dynamic value;
        if (['FILE', 'IMAGE', 'PDF'].contains(type)) {
          final selected = _files[id] ?? [];
          for (final file in selected) {
            if (!mounted) return;
            if (file.assetId == null && file.path != null) {
              setState(
                () => _uploadProgress =
                    'Uploading ${definition['label']}: ${selected.indexOf(file) + 1} of ${selected.length}',
              );
              final uploaded = await _repository.uploadFile(
                id,
                file.name,
                file.path!,
              );
              final assetId = uploaded['id'];
              if (assetId is! String || assetId.isEmpty) {
                throw StateError(
                  'File upload did not return a valid file ID. Please try again.',
                );
              }
              file.assetId = assetId;
              await _saveDraft(required: true);
            }
            if (file.assetId == null) {
              throw StateError('Choose ${file.name} again before submitting.');
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
      if (!mounted) return;
      setState(() => _uploadProgress = 'Submitting application');
      await _repository.submit({
        'version': _application?['version'] ?? 0,
        'policy_version': policy?['version'],
        'accepted': true,
        'contact_email': _email.text.trim(),
        'whatsapp_phone': _phone.text.trim(),
        'answers': answers,
      });
      _submissionCommitted = true;
    });
  }

  Future<void> _recoverSelfie() async {
    if (!Platform.isAndroid) return;
    if (!mounted) return;
    setState(() => _capturingSelfie = true);
    try {
      final recovered = await ImagePicker().retrieveLostData();
      if (!mounted || recovered.isEmpty) return;
      if (recovered.exception != null) throw recovered.exception!;
      final file = recovered.files?.firstOrNull;
      if (file != null) await _useSelfie(file);
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _capturingSelfie = false);
    }
  }

  Future<void> _useSelfie(XFile file) async {
    const id = '__live_selfie__';
    if (!_definitions.any((d) => d['id'] == id) ||
        (_application != null &&
            _status != 'CHANGES_REQUESTED' &&
            !_needsSelfie)) {
      return;
    }
    if (_answers.any(
      (a) => a['requirement_id'] == id && a['status'] == 'APPROVED',
    )) {
      return;
    }
    if (await file.length() > 3000000) {
      throw StateError('Retake a smaller selfie (up to 3 MB).');
    }
    final store = _draftStore;
    if (store == null) {
      throw StateError('Refresh your account before choosing files.');
    }
    final selected = await store.stage('live_selfie.jpg', file.openRead());
    if (!mounted) return;
    for (final previous in _files[id] ?? <PartnerLocalFile>[]) {
      if (previous.path != null) {
        await PartnerUploadTile.previewFile(previous.path!).evict();
      }
    }
    if (!mounted) return;
    setState(() {
      _files[id] = [selected];
      _dirty = true;
      _error = null;
    });
    await _saveDraft();
  }

  Future<void> _captureSelfie() async {
    if (_saving || _capturingSelfie || _pickingFiles) return;
    final wasDirty = _dirty;
    var captured = false;
    _markDirty();
    setState(() => _capturingSelfie = true);
    try {
      await _saveDraft();
      await WidgetsBinding.instance.endOfFrame;
      // Android may reclaim this process while the external camera is open.
      // Remove our offscreen preview cache before giving the camera memory.
      for (final files in _files.values) {
        for (final file in files) {
          if (file.path != null) {
            await PartnerUploadTile.previewFile(file.path!).evict();
          }
        }
      }
      final image =
          await (widget.captureSelfie?.call() ??
              ImagePicker().pickImage(
                source: ImageSource.camera,
                preferredCameraDevice: CameraDevice.front,
                maxWidth: 1024,
                maxHeight: 1024,
                imageQuality: 80,
                requestFullMetadata: false,
              ));
      if (image != null && mounted) {
        await _useSelfie(image);
        captured = true;
      }
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) {
        setState(() {
          _capturingSelfie = false;
          if (!captured) _dirty = wasDirty;
        });
      }
    }
  }

  Future<void> _pick(Map<String, dynamic> definition) async {
    if (_saving || _pickingFiles || _capturingSelfie) return;
    if (definition['capture_mode'] == 'CAMERA') {
      await _captureSelfie();
      return;
    }
    final wasDirty = _dirty;
    var selectedFiles = false;
    _markDirty();
    setState(() => _pickingFiles = true);
    final picked = <PartnerLocalFile>[];
    try {
      await _saveDraft();
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
      final store = _draftStore;
      if (store == null) {
        throw StateError('Refresh your account before choosing files.');
      }
      final limit =
          (((definition['max_file_size_mb'] as num?)?.toDouble() ?? 3) *
                  1024 *
                  1024)
              .floor()
              .clamp(1, 3000000);
      final List<PlatformFile> result;
      if (widget.selectFiles != null) {
        picked.addAll(await widget.selectFiles!(definition) ?? []);
        result = [];
      } else if (definition['allow_multiple'] == true) {
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
      if (!mounted || (result.isEmpty && picked.isEmpty)) return;
      final existingCount = definition['allow_multiple'] == true
          ? (_files['${definition['id']}']?.length ?? 0)
          : 0;
      if (existingCount + result.length + picked.length > 10) {
        throw StateError('Choose at most 10 files for one field.');
      }
      for (final file in result) {
        final size = await file.length();
        if (size == null || size > 3000000 || size > limit) {
          throw StateError(
            'Choose files within the configured size limit and no larger than 3 MB.',
          );
        }
        picked.add(
          await store.stage(
            file.name,
            file.readAsByteStream(),
            maxBytes: limit,
          ),
        );
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
      selectedFiles = true;
      await _saveDraft();
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (!selectedFiles) {
        for (final file in picked) {
          await _draftStore?.remove(file);
        }
      }
      if (mounted) {
        setState(() {
          _pickingFiles = false;
          if (!selectedFiles) _dirty = wasDirty;
        });
      }
    }
  }

  Future<bool> _discard() async {
    final discard =
        await showDialog<bool>(
          context: context,
          builder: (dialogContext) => LiquidGlassDialog(
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
    if (discard) {
      _draftTimer?.cancel();
      try {
        await _draftStore?.clear();
        _dirty = false;
      } catch (_) {
        if (mounted) {
          setState(
            () => _error =
                'The local draft could not be discarded. Check device storage and try again.',
          );
        }
        return false;
      }
    }
    return discard;
  }

  Widget _statusBadge(String status) {
    final rejected = status == 'REJECTED' || status.contains('CHANGES');
    final approved = ['APPROVED', 'COMPLETED', 'ACTIVATED'].contains(status);
    return LiquidGlassSurface(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      radius: 12,
      tint: rejected
          ? AppColors.googleRed
          : approved
          ? AppColors.primaryGreen
          : AppColors.gold,
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

  String? _linkedAddressValue(Map<String, dynamic> definition, String kind) {
    final group = definition['address_group'];
    if (group == null || definition['input_kind'] == kind) return null;
    final siblings = _definitions
        .where(
          (field) =>
              field['address_group'] == group && field['input_kind'] == kind,
        )
        .toList();
    return siblings.length == 1
        ? _controllers['${siblings.single['id']}']?.text ?? ''
        : null;
  }

  void _addressChanged(Map<String, dynamic> definition) {
    final kind = definition['input_kind'];
    final group = definition['address_group'];
    if (group != null && (kind == 'STATE' || kind == 'CITY')) {
      for (final field in _definitions) {
        if (field['address_group'] != group ||
            field['id'] == definition['id']) {
          continue;
        }
        final clear =
            field['input_kind'] == 'PINCODE' ||
            (kind == 'STATE' && field['input_kind'] == 'CITY');
        final approved = _answers.any(
          (answer) =>
              answer['requirement_id'] == field['id'] &&
              answer['status'] == 'APPROVED',
        );
        if (clear && !approved) _controllers['${field['id']}']?.clear();
      }
    }
    setState(() => _dirty = true);
    _scheduleDraft();
  }

  Widget _field(Map<String, dynamic> definition, bool editing) {
    final id = '${definition['id']}';
    final type = '${definition['field_type']}';
    final kind = '${definition['input_kind'] ?? 'DEFAULT'}';
    final required = definition['is_required'] == true;
    final answer = _answers
        .where((item) => item['requirement_id'] == id)
        .firstOrNull;
    final enabled =
        editing &&
        !_saving &&
        !_pickingFiles &&
        !_capturingSelfie &&
        answer?['status'] != 'APPROVED';
    final label = '${definition['label']}${required ? ' *' : ''}';
    final children = <Widget>[
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
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
      children.add(
        PartnerUploadTile(
          key: ValueKey('partner-upload-$id'),
          files: files
              .map(
                (file) => PartnerUploadFile(
                  name: file.name,
                  path: file.path,
                  onOpen: file.assetId == null
                      ? null
                      : () => _download(file.assetId!),
                  onRemove: !enabled
                      ? null
                      : () => setState(() {
                          if (file.path != null) {
                            unawaited(
                              PartnerUploadTile.previewFile(file.path!).evict(),
                            );
                          }
                          files.remove(file);
                          _dirty = true;
                          _scheduleDraft();
                        }),
                ),
              )
              .toList(),
          image: type == 'IMAGE',
          camera: definition['capture_mode'] == 'CAMERA',
          busy: _saving || _pickingFiles || _capturingSelfie,
          onChoose: editing && answer?['status'] != 'APPROVED'
              ? () => _pick(definition)
              : null,
          limitText:
              'Files are uploaded when you submit. Maximum 3 MB per file (or the configured smaller limit).',
        ),
      );
    } else if (['ADDRESS', 'STATE', 'CITY', 'PINCODE'].contains(kind)) {
      final linkedState = _linkedAddressValue(definition, 'STATE');
      final linkedCity = kind == 'PINCODE'
          ? _linkedAddressValue(definition, 'CITY')
          : null;
      children.add(
        PartnerAddressInput(
          key: ValueKey(
            '$id-${_application?['version'] ?? 0}-$linkedState-$linkedCity',
          ),
          controller: _controllers[id]!,
          kind: kind,
          enabled: enabled,
          required: required,
          linkedState: linkedState,
          linkedCity: linkedCity,
          onChanged: () => _addressChanged(definition),
        ),
      );
    } else if (kind == 'GENDER' || kind == 'OWNERSHIP') {
      final options = List<String>.from(definition['options'] as List? ?? []);
      final existing = _controllers[id]?.text ?? '';
      final selection = options
          .where((option) => option.toLowerCase() == existing.toLowerCase())
          .firstOrNull;
      if (!enabled) {
        children.add(Text(existing.isEmpty ? 'Not provided' : existing));
      } else {
        children.add(
          LiquidGlassSurface(
            padding: EdgeInsets.zero,
            radius: 20,
            child: DropdownButtonFormField<String>(
              key: ValueKey('$id-$selection-$enabled'),
              initialValue: selection,
              isExpanded: true,
              decoration: InputDecoration(
                border: GlassTokens.inputBorder,
                hintText: 'Select ${definition['label']}',
              ),
              items: [
                if (!required)
                  const DropdownMenuItem(
                    value: '',
                    child: Text('Not provided'),
                  ),
                ...options.map(
                  (option) =>
                      DropdownMenuItem(value: option, child: Text(option)),
                ),
              ],
              onChanged: (value) => setState(() {
                _controllers[id]!.text = value ?? '';
                _dirty = true;
                _scheduleDraft();
              }),
              validator: (value) =>
                  (required || existing.isNotEmpty) &&
                      (value == null || (required && value.isEmpty))
                  ? 'Choose an option.'
                  : null,
            ),
          ),
        );
      }
    } else if (type == 'BOOLEAN') {
      children.add(
        LiquidGlassSurface(
          padding: EdgeInsets.zero,
          radius: 20,
          child: DropdownButtonFormField<bool>(
            key: ValueKey('$id-${_values[id]}-$enabled'),
            initialValue: _values[id] as bool?,
            decoration: const InputDecoration(
              border: GlassTokens.inputBorder,
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
                    _scheduleDraft();
                  })
                : null,
            validator: (value) =>
                required && value == null ? 'Choose yes or no.' : null,
          ),
        ),
      );
    } else {
      children.add(
        LiquidGlassSurface(
          padding: EdgeInsets.zero,
          radius: 20,
          child: TextFormField(
            controller: _controllers[id],
            enabled: enabled,
            readOnly: type == 'DATE' || kind == 'DOB',
            textCapitalization: kind == 'IFSC'
                ? TextCapitalization.characters
                : TextCapitalization.none,
            inputFormatters: kind == 'IFSC'
                ? [
                    FilteringTextInputFormatter.allow(RegExp('[a-zA-Z0-9]')),
                    LengthLimitingTextInputFormatter(11),
                    TextInputFormatter.withFunction(
                      (oldValue, newValue) => newValue.copyWith(
                        text: newValue.text.toUpperCase(),
                        composing: TextRange.empty,
                      ),
                    ),
                  ]
                : null,
            maxLines: type == 'TEXT' ? 4 : 1,
            keyboardType: type == 'NUMBER'
                ? const TextInputType.numberWithOptions(
                    decimal: true,
                    signed: true,
                  )
                : TextInputType.text,
            decoration: InputDecoration(
              border: GlassTokens.inputBorder,
              hintText: '${definition['placeholder'] ?? ''}',
              suffixIcon: type == 'DATE' || kind == 'DOB'
                  ? const Icon(Icons.calendar_today_outlined)
                  : null,
            ),
            onChanged: (_) => _markDirty(),
            onTap: (type == 'DATE' || kind == 'DOB') && enabled
                ? () async {
                    final parsed = DateTime.tryParse(
                      _controllers[id]?.text ?? '',
                    );
                    final now = DateTime.now();
                    final first = DateTime(1900);
                    final last = kind == 'DOB'
                        ? DateTime(now.year, now.month, now.day)
                        : DateTime(2100);
                    final initial = parsed == null || parsed.isAfter(last)
                        ? last
                        : parsed.isBefore(first)
                        ? first
                        : parsed;
                    final date = await showDatePicker(
                      builder: (context, child) =>
                          LiquidGlassScope(child: child!),
                      context: context,
                      initialDate: initial,
                      firstDate: first,
                      lastDate: last,
                    );
                    if (date != null && mounted) {
                      setState(() {
                        _controllers[id]!.text = date
                            .toIso8601String()
                            .substring(0, 10);
                        _dirty = true;
                        _scheduleDraft();
                      });
                    }
                  }
                : null,
            validator: (value) {
              final text = value?.trim() ?? '';
              if (required && text.isEmpty) return 'This field is required.';
              if (text.isEmpty) return null;
              if (enabled && kind == 'DOB') {
                final date = DateTime.tryParse(text);
                final now = DateTime.now();
                if (date == null ||
                    date.year < 1900 ||
                    date.isAfter(DateTime(now.year, now.month, now.day)) ||
                    date.toIso8601String().substring(0, 10) != text) {
                  return 'Choose a date of birth on or before today.';
                }
              }
              if (enabled &&
                  kind == 'IFSC' &&
                  !RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$').hasMatch(text)) {
                return 'Enter a valid 11-character IFSC code.';
              }
              if (enabled &&
                  kind == 'UPI' &&
                  !RegExp(
                    r'^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}@[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,62}[a-zA-Z0-9])$',
                  ).hasMatch(text)) {
                return 'Enter a valid UPI ID, for example name@bank.';
              }
              final maxLength =
                  (definition['max_length'] as num?)?.toInt() ?? 10000;
              if (text.length > maxLength) {
                return 'Maximum $maxLength characters.';
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
    final editing =
        _application == null || _status == 'CHANGES_REQUESTED' || _needsSelfie;
    final widgets = <Widget>[
      if (_application != null)
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _statusBadge(_status),
              const SizedBox(height: 10),
              Text(
                _needsSelfie
                    ? 'Please add a live selfie and resubmit. Your approved fields are preserved.'
                    : _status == 'CHANGES_REQUESTED'
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
            LiquidGlassSurface(
              padding: EdgeInsets.zero,
              radius: 20,
              child: TextFormField(
                controller: _email,
                enabled:
                    editing && !_saving && !_pickingFiles && !_capturingSelfie,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email for final PDF *',
                  border: GlassTokens.inputBorder,
                ),
                onChanged: (_) => _markDirty(),
                validator: (value) =>
                    RegExp(
                      r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                    ).hasMatch(value?.trim() ?? '')
                    ? null
                    : 'Enter a valid email address.',
              ),
            ),
            const SizedBox(height: 14),
            LiquidGlassSurface(
              padding: EdgeInsets.zero,
              radius: 20,
              child: TextFormField(
                controller: _phone,
                enabled:
                    editing && !_saving && !_pickingFiles && !_capturingSelfie,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'WhatsApp number with country code *',
                  hintText: '+919876543210',
                  border: GlassTokens.inputBorder,
                ),
                onChanged: (_) => _markDirty(),
                validator: (value) =>
                    RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(value?.trim() ?? '')
                    ? null
                    : 'Include + and your country code.',
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Your administrator will review these contacts before sharing your final document.',
              style: TextStyle(fontSize: 12, color: GlassTokens.muted),
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
      if (_error != null) {
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              _error!,
              style: const TextStyle(color: AppColors.googleRed),
            ),
          ),
        );
      }
      if (_uploadProgress != null) {
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              _uploadProgress!,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        );
      }
      if (_needsSignIn) {
        widgets.add(
          OutlinedButton.icon(
            onPressed: _saving
                ? null
                : () async {
                    try {
                      await _saveDraft(required: true);
                    } catch (_) {
                      return;
                    }
                    if (mounted) {
                      Navigator.pushNamedAndRemoveUntil(
                        context,
                        AppRoutes.login,
                        (_) => false,
                      );
                    }
                  },
            icon: const Icon(Icons.refresh),
            label: const Text('Sign in again'),
          ),
        );
      } else {
        widgets.add(
          AppButton(
            text: _application == null
                ? 'Submit application'
                : 'Submit corrections',
            onPressed:
                _saving || _capturingSelfie || _pickingFiles || _needsSignIn
                ? null
                : _submit,
            isLoading: _saving,
          ),
        );
      }
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
        LiquidGlassSurface(
          padding: const EdgeInsets.all(8),
          child: ExpansionTile(
            title: const Text('Read accepted policy'),
            children: [PartnerDocument(document: _map(_workflow!['policy'])!)],
          ),
        ),
      );
    }
    return widgets;
  }

  List<Widget> _contents() {
    if (_workflow == null) return [];
    if (_submissionCommitted) {
      return [
        const AppCard(
          child: Text(
            'Your application was submitted. Refresh to load its review status.',
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: _saving ? null : () => _load(),
          icon: const Icon(Icons.refresh),
          label: const Text('Load review status'),
        ),
      ];
    }
    if (_status == 'EXITED') {
      return [
        const SizedBox(height: 24),
        const AppCard(
          child: Text(
            'Your partner exit is complete. Driver operations are disabled. Your settlement PDF and account history remain available.',
          ),
        ),
        const SizedBox(height: 20),
        AppButton(
          text: 'Exit Request & Dues',
          onPressed: () => Navigator.pushNamed(context, AppRoutes.driverExit),
        ),
      ];
    }
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
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.w600),
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
                    try {
                      final user = await AuthRepository().currentUser();
                      await AppModeRepository().save(user.id, AppMode.driver);
                    } catch (_) {}
                    if (!mounted) return;
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
          style: TextStyle(fontSize: 12, color: GlassTokens.muted, height: 1.5),
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
          LiquidGlassSurface(
            padding: EdgeInsets.zero,
            radius: 20,
            child: TextFormField(
              controller: _signature,
              enabled: !_saving,
              decoration: const InputDecoration(
                labelText: 'Your full legal name *',
                border: GlassTokens.inputBorder,
              ),
              onChanged: (_) => _markDirty(),
              validator: (value) => (value?.trim().length ?? 0) >= 2
                  ? null
                  : 'Enter your full legal name.',
            ),
          ),
          const SizedBox(height: 12),
          LiquidGlassSurface(
            padding: const EdgeInsets.all(8),
            child: CheckboxListTile(
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
        LiquidGlassSurface(
          padding: const EdgeInsets.all(8),
          child: CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _acceptPolicy,
            onChanged: (value) =>
                setState(() => _acceptPolicy = value ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: AppColors.primaryGreen,
            title: const Text(
              'I have read the policy and agree to apply for the Partner Program.',
            ),
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
    canPop: !_dirty && !_saving && !_pickingFiles && !_capturingSelfie,
    onPopInvokedWithResult: (didPop, result) async {
      if (didPop || _saving || _pickingFiles || _capturingSelfie) return;
      if (await _discard() && context.mounted) Navigator.pop(context);
    },
    child: AppPage(
      glass: true,
      title: 'Partner Program',
      action: IconButton(
        tooltip: 'Refresh partner status',
        onPressed: _saving || _pickingFiles || _capturingSelfie
            ? null
            : () async {
                if (_dirty && !await _discard()) return;
                _load();
              },
        icon: const Icon(Icons.refresh),
      ),
      child: _loading
          ? LiquidGlassFormSkeleton(
              document: !_showForm && _application == null,
            )
          : _workflow == null
          ? AppLoadError(
              message: _error ?? 'Could not load Partner Program.',
              onRetry: () => _load(),
            )
          : RefreshIndicator(
              onRefresh: () async {
                if (!_dirty &&
                    !_saving &&
                    !_pickingFiles &&
                    !_capturingSelfie) {
                  await _load(background: true);
                }
              },
              color: AppColors.primaryGreen,
              child: Form(
                key: _form,
                child: ListView(
                  controller: _scroll,
                  padding: const EdgeInsets.only(bottom: 32),
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    if (_error != null && !_editingApplication)
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
