import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/settings/widgets/settings_secondary.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class EmergencyContactsPage extends StatefulWidget {
  final UserAppRepository? repository;
  const EmergencyContactsPage({super.key, this.repository});

  @override
  State<EmergencyContactsPage> createState() => _EmergencyContactsPageState();
}

class _EmergencyContactsPageState extends State<EmergencyContactsPage> {
  late final UserAppRepository _repository =
      widget.repository ?? UserAppRepository();
  List<Map<String, dynamic>> _contacts = const [];
  Object? _error;
  bool _loading = true;
  bool _saving = false;
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
      final value = await _repository.emergencyContacts();
      if (!mounted || generation != _generation) return;
      setState(() {
        _contacts = value;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      if (preserve && _contacts.isNotEmpty) {
        _showError(error);
        return;
      }
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _edit([Map<String, dynamic>? current]) async {
    if (_saving) return;
    final value = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _EmergencyContactDialog(current: current),
    );
    if (value == null || !mounted) return;
    setState(() => _saving = true);
    try {
      if (current == null) {
        await _repository.addEmergencyContact(value);
      } else {
        await _repository.updateEmergencyContact('${current['id']}', value);
      }
      await _load(preserve: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              current == null
                  ? 'Emergency contact added.'
                  : 'Emergency contact updated.',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _confirmDelete(Map<String, dynamic> contact) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => LiquidGlassDialog(
        title: const Text('Remove emergency contact?'),
        content: Text(
          '${contact['name'] ?? 'This person'} will no longer be available from your ride safety tools.',
          style: const TextStyle(color: GlassTokens.muted, height: 1.45),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep contact'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.googleRed),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true || _saving) return;
    setState(() => _saving = true);
    try {
      await _repository.deleteEmergencyContact('${contact['id']}');
      await _load(preserve: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Emergency contact removed.')),
        );
      }
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _call(String phone) async {
    try {
      if (await launchUrl(
        Uri(scheme: 'tel', path: phone),
        mode: LaunchMode.externalApplication,
      )) {
        return;
      }
    } catch (_) {}
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Calling could not be opened.')),
      );
    }
  }

  Future<void> _actions(Map<String, dynamic> contact) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => SafeArea(
        child: LiquidGlassSheet(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '${contact['name'] ?? 'Emergency contact'}',
                  style: const TextStyle(
                    color: GlassTokens.ink,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${contact['phone_e164'] ?? ''}',
                  style: const TextStyle(color: GlassTokens.muted),
                ),
                const SizedBox(height: 16),
                _sheetAction(
                  sheetContext,
                  'call',
                  Icons.phone_outlined,
                  'Call contact',
                ),
                _sheetAction(
                  sheetContext,
                  'edit',
                  Icons.edit_outlined,
                  'Edit details',
                ),
                _sheetAction(
                  sheetContext,
                  'delete',
                  Icons.delete_outline,
                  'Remove contact',
                  destructive: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (!mounted) return;
    if (result == 'call') await _call('${contact['phone_e164']}');
    if (result == 'edit') await _edit(contact);
    if (result == 'delete') await _confirmDelete(contact);
  }

  Widget _sheetAction(
    BuildContext context,
    String result,
    IconData icon,
    String label, {
    bool destructive = false,
  }) => ListTile(
    contentPadding: EdgeInsets.zero,
    minTileHeight: 52,
    leading: Icon(
      icon,
      color: destructive ? AppColors.googleRed : GlassTokens.accent,
    ),
    title: Text(
      label,
      style: TextStyle(
        color: destructive ? AppColors.googleRed : GlassTokens.ink,
        fontWeight: FontWeight.w500,
      ),
    ),
    trailing: const Icon(Icons.chevron_right, color: GlassTokens.muted),
    onTap: () => Navigator.pop(context, result),
  );

  void _showError(Object error) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.EMERGENCY_CONTACTS,
    glass: true,
    scrollable: true,
    action: IconButton(
      tooltip: 'Add emergency contact',
      onPressed: _saving ? null : () => _edit(),
      icon: const Icon(
        Icons.person_add_alt_1_outlined,
        color: GlassTokens.accent,
      ),
    ),
    child: _body(),
  );

  Widget _body() {
    if (_loading && _contacts.isEmpty) {
      return const SettingsListSkeleton(rows: 3);
    }
    if (_error != null && _contacts.isEmpty) {
      return AppLoadError(
        message: ApiResult.errorMessage(_error!),
        onRetry: _load,
      );
    }
    return RefreshIndicator(
      onRefresh: () => _load(preserve: true),
      color: GlassTokens.accent,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 30),
        children: [
          SettingsIntroCard(
            icon: Icons.health_and_safety_outlined,
            title: 'People you trust, ready when needed',
            body:
                'These contacts are available from ride safety tools. 1More does not contact them automatically or replace emergency services.',
            footer: SizedBox(
              width: double.infinity,
              child: LiquidGlassButton(
                text: 'Add emergency contact',
                icon: const Icon(Icons.person_add_alt_1_outlined),
                onPressed: _saving ? null : () => _edit(),
                busy: _saving,
              ),
            ),
          ),
          const SizedBox(height: 22),
          SettingsSectionHeader(
            title: 'Your contacts',
            helper: _contacts.isEmpty
                ? 'Add at least one trusted person.'
                : '${_contacts.length} ${_contacts.length == 1 ? 'person' : 'people'} available from ride safety.',
          ),
          const SizedBox(height: 12),
          if (_contacts.isEmpty)
            const SettingsEmptyCard(
              icon: Icons.people_outline,
              title: UserAppCopy.EMPTY_CONTACTS,
              body: UserAppCopy.EMPTY_CONTACTS_DESCRIPTION,
            )
          else
            for (var index = 0; index < _contacts.length; index++) ...[
              _contact(_contacts[index]),
              if (index != _contacts.length - 1) const SizedBox(height: 12),
            ],
          const SizedBox(height: 18),
          const Text(
            'For immediate danger, contact local emergency services directly. Calling a saved contact uses your phone app.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: GlassTokens.muted,
              fontSize: 11,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }

  Widget _contact(Map<String, dynamic> contact) {
    final name = '${contact['name'] ?? ''}'.trim();
    final relationship = '${contact['relationship'] ?? ''}'.trim();
    final initial = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    return LiquidGlassSurface(
      padding: const EdgeInsets.all(17),
      child: Row(
        children: [
          Semantics(
            label: '$name contact',
            child: Container(
              width: 48,
              height: 48,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: GlassTokens.accent.withValues(alpha: .10),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white.withValues(alpha: .72)),
              ),
              child: Text(
                initial,
                style: const TextStyle(
                  color: GlassTokens.accent,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name.isEmpty ? 'Emergency contact' : name,
                  style: const TextStyle(
                    color: GlassTokens.ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${contact['phone_e164'] ?? ''}',
                  style: const TextStyle(
                    color: GlassTokens.muted,
                    fontSize: 13,
                  ),
                ),
                if (relationship.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  SettingsStatusPill(
                    label: relationship,
                    color: GlassTokens.accent,
                    icon: Icons.people_outline,
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            tooltip: 'Contact actions for $name',
            onPressed: _saving ? null : () => _actions(contact),
            icon: const Icon(Icons.more_horiz, color: GlassTokens.accent),
          ),
        ],
      ),
    );
  }
}

class _EmergencyContactDialog extends StatefulWidget {
  final Map<String, dynamic>? current;
  const _EmergencyContactDialog({this.current});

  @override
  State<_EmergencyContactDialog> createState() =>
      _EmergencyContactDialogState();
}

class _EmergencyContactDialogState extends State<_EmergencyContactDialog> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(
    text: '${widget.current?['name'] ?? ''}',
  );
  late final TextEditingController _phone = TextEditingController(
    text: '${widget.current?['phone_e164'] ?? ''}',
  );
  late final TextEditingController _relationship = TextEditingController(
    text: '${widget.current?['relationship'] ?? ''}',
  );

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _relationship.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_form.currentState?.validate() ?? false)) return;
    Navigator.pop(context, {
      'name': _name.text.trim(),
      'phone_e164': _phone.text.replaceAll(RegExp(r'\s+'), ''),
      'relationship': _relationship.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) => LiquidGlassDialog(
    title: Text(widget.current == null ? 'Add trusted person' : 'Edit contact'),
    content: Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Use a number with its country code so ride safety tools can call it reliably.',
            style: TextStyle(color: GlassTokens.muted, height: 1.45),
          ),
          const SizedBox(height: 18),
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            maxLength: 100,
            decoration: const InputDecoration(
              labelText: 'Full name',
              prefixIcon: Icon(Icons.person_outline),
              counterText: '',
            ),
            validator: (value) => (value?.trim().isEmpty ?? true)
                ? 'Enter the contact name'
                : null,
          ),
          const SizedBox(height: 18),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[+0-9 ]')),
              LengthLimitingTextInputFormatter(18),
            ],
            decoration: const InputDecoration(
              labelText: 'Phone with country code',
              hintText: '+91 98765 43210',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
            validator: (value) {
              final compact = (value ?? '').replaceAll(RegExp(r'\s+'), '');
              return RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(compact)
                  ? null
                  : 'Use + followed by 8 to 15 digits';
            },
          ),
          const SizedBox(height: 18),
          TextFormField(
            controller: _relationship,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.done,
            maxLength: 80,
            decoration: const InputDecoration(
              labelText: 'Relationship (optional)',
              hintText: 'Parent, sibling, friend…',
              prefixIcon: Icon(Icons.people_outline),
              counterText: '',
            ),
            onFieldSubmitted: (_) => _submit(),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: _submit,
        child: Text(widget.current == null ? 'Add contact' : 'Save changes'),
      ),
    ],
  );
}
