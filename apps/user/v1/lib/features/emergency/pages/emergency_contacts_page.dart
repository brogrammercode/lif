import 'package:user/features/emergency/controllers/emergency_contacts_controller.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/emergency/widgets/emergency_contact_sheet.dart';
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
  late final _controller = EmergencyContactsController(
    widget.repository ?? UserAppRepository(),
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  UserAppRepository get _repository => _controller.repository;
  List<Map<String, dynamic>> get _contacts => _controller.contacts;
  Object? get _error => _controller.error;
  bool get _loading => _controller.loading;
  bool get _saving => _controller.saving;
  set _saving(bool value) => _controller.saving = value;

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

  Future<void> _edit([Map<String, dynamic>? current]) async {
    if (_saving) return;
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => EmergencyContactSheet(
        contact: current,
        onSubmit: (value) async {
          setState(() => _saving = true);
          try {
            if (current == null) {
              await _repository.addEmergencyContact(value);
            } else {
              await _repository.updateEmergencyContact(
                '${current['id']}',
                value,
              );
            }
            await _load(preserve: true);
          } finally {
            if (mounted) setState(() => _saving = false);
          }
        },
      ),
    );
    if (saved == true && mounted) {
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
  }

  Future<void> _confirmDelete(Map<String, dynamic> contact) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Colors.white,
        title: const Text(
          'Remove emergency contact?',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
        ),
        content: Text(
          'Remove ${contact['name'] ?? 'this person'} from your emergency contacts?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.googleRed,
              foregroundColor: Colors.white,
            ),
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

  Future<void> _showContactActions(Map<String, dynamic> contact) async {
    final name = '${contact['name'] ?? 'Emergency contact'}';
    final phone = '${contact['phone_e164'] ?? ''}';
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => SolidSheet(
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    color: RideTokens.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  phone,
                  style: const TextStyle(fontSize: 13, color: RideTokens.muted),
                ),
                const SizedBox(height: 12),
                _contactAction(
                  sheetContext,
                  value: 'call',
                  icon: Icons.call_outlined,
                  label: 'Call contact',
                ),
                _contactAction(
                  sheetContext,
                  value: 'edit',
                  icon: Icons.edit_outlined,
                  label: 'Edit contact',
                ),
                _contactAction(
                  sheetContext,
                  value: 'remove',
                  icon: Icons.delete_outline_rounded,
                  label: 'Remove contact',
                  destructive: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (!mounted) return;
    if (action == 'call') await _call(phone);
    if (action == 'edit') await _edit(contact);
    if (action == 'remove') await _confirmDelete(contact);
  }

  Widget _contactAction(
    BuildContext context, {
    required String value,
    required IconData icon,
    required String label,
    bool destructive = false,
  }) => ListTile(
    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
    minTileHeight: 50,
    leading: Icon(
      icon,
      size: 20,
      color: destructive ? AppColors.googleRed : RideTokens.ink,
    ),
    title: Text(
      label,
      style: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        color: destructive ? AppColors.googleRed : RideTokens.ink,
      ),
    ),
    onTap: () => Navigator.pop(context, value),
  );

  void _showError(Object error) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.EMERGENCY_CONTACTS,
    scrollable: true,
    action: IconButton(
      tooltip: 'Add emergency contact',
      onPressed: _saving ? null : () => _edit(),
      icon: const Icon(Icons.person_add_alt_1_outlined, color: Colors.white),
    ),
    child: _body(),
  );

  Widget _body() {
    if (_loading && _contacts.isEmpty) {
      return const SettingsListSkeleton(rows: 3, intro: false);
    }
    if (_error != null && _contacts.isEmpty) {
      return AppLoadError(
        message: ApiResult.errorMessage(_error!),
        onRetry: _load,
      );
    }
    return RefreshIndicator(
      onRefresh: () => _load(preserve: true),
      color: RideTokens.accent,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        children: [
          if (_contacts.isEmpty)
            const SettingsEmptyCard(
              icon: Icons.people_outline,
              title: UserAppCopy.EMPTY_CONTACTS,
              body: UserAppCopy.EMPTY_CONTACTS_DESCRIPTION,
            )
          else
            for (var index = 0; index < _contacts.length; index++) ...[
              _contact(_contacts[index]),
              if (index != _contacts.length - 1)
                const Padding(
                  padding: EdgeInsets.only(left: 56),
                  child: Divider(height: 1, color: Color(0xFFEEEEEE)),
                ),
            ],
        ],
      ),
    );
  }

  Widget _contact(Map<String, dynamic> contact) {
    final name = '${contact['name'] ?? ''}'.trim();
    final relationship = '${contact['relationship'] ?? ''}'.trim();
    final initial = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    final subtitle = relationship.isEmpty
        ? '${contact['phone_e164'] ?? ''}'
        : '${contact['phone_e164'] ?? ''} · $relationship';
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: _saving ? null : () => _call('${contact['phone_e164'] ?? ''}'),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 2),
          child: Row(
            children: [
              Semantics(
                label: '$name contact',
                child: Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: Color(0xFFF1F3F6),
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    initial,
                    style: const TextStyle(
                      color: RideTokens.accent,
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.isEmpty ? 'Emergency contact' : name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: RideTokens.ink,
                        fontSize: 14,
                        height: 1.25,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: RideTokens.muted,
                        fontSize: 12,
                        height: 1.3,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Contact options for $name',
                onPressed: _saving ? null : () => _showContactActions(contact),
                icon: const Icon(Icons.more_horiz_rounded, size: 21),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
