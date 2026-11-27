import 'package:user/components/ui/app_error_snackbar.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/country_picker_widget.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/profile/controllers/profile_controller.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class ProfilePage extends StatefulWidget {
  final UserAppRepository? repository;
  final bool phoneOnly;
  const ProfilePage({super.key, this.repository, this.phoneOnly = false});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late final _controller = ProfileController(
    widget.repository ?? UserAppRepository(),
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  UserAppRepository get _repository => _controller.repository;
  Future<Map<String, dynamic>> get _profile => _controller.profile;
  set _profile(Future<Map<String, dynamic>> value) =>
      _controller.profile = value;

  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _phone = TextEditingController();
  bool _fieldsLoaded = false;
  bool _saving = false;

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _editName() async {
    final name = await _editValue(
      title: 'Name',
      initialValue: [
        _firstName.text,
        _lastName.text,
      ].where((part) => part.trim().isNotEmpty).join(' '),
      hint: 'Full name',
      keyboardType: TextInputType.name,
    );
    if (name == null) return;
    final parts = name.trim().split(RegExp(r'\s+'));
    setState(() {
      _firstName.text = parts.first;
      _lastName.text = parts.skip(1).join(' ');
    });
  }

  Future<void> _editPhone() async {
    final phone = await _editValue(
      title: 'Phone number',
      initialValue: _phone.text,
      hint: '+919876543210',
      keyboardType: TextInputType.phone,
    );
    if (phone != null && mounted) setState(() => _phone.text = phone.trim());
  }

  Future<String?> _editValue({
    required String title,
    required String initialValue,
    required String hint,
    required TextInputType keyboardType,
  }) => showDialog<String>(
    context: context,
    builder: (dialogContext) => _ProfileValueDialog(
      title: title,
      initialValue: initialValue,
      hint: hint,
      keyboardType: keyboardType,
      onCancel: () => Navigator.pop(dialogContext),
      onSave: (value) => Navigator.pop(dialogContext, value),
    ),
  );

  Future<void> _save(UserModel user) async {
    if (!widget.phoneOnly &&
        (_firstName.text.trim().isEmpty || _lastName.text.trim().isEmpty)) {
      _notice('Enter your first and last name.');
      return;
    }
    final phone = _phone.text.trim();
    if (widget.phoneOnly && phone.isEmpty) {
      _notice('Enter your phone number.');
      return;
    }
    if (phone.isNotEmpty && !RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(phone)) {
      _notice('Use international format, for example +919876543210.');
      return;
    }

    final updates = <String, dynamic>{};
    if (!widget.phoneOnly && _firstName.text.trim() != user.firstName?.trim()) {
      updates['first_name'] = _firstName.text.trim();
    }
    if (!widget.phoneOnly && _lastName.text.trim() != user.lastName?.trim()) {
      updates['last_name'] = _lastName.text.trim();
    }
    if (phone.isNotEmpty && phone != user.phoneE164?.trim()) {
      updates['phone_e164'] = phone;
    }
    if (updates.isEmpty) {
      _notice('There are no profile changes to save.');
      return;
    }

    setState(() => _saving = true);
    try {
      final updatedProfile = await _repository.updateProfile(updates);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(UserAppCopy.PROFILE_SAVED)));
      setState(() {
        _profile = Future.value(updatedProfile);
        _fieldsLoaded = false;
      });
    } catch (error) {
      if (mounted) _notice(ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _notice(String message) => showAppError(context, message);

  @override
  Widget build(BuildContext context) => SolidPage(
    title: widget.phoneOnly ? 'Change Phone Number' : UserAppCopy.PROFILE,
    child: FutureBuilder<Map<String, dynamic>>(
      future: _profile,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: () => setState(() => _profile = _repository.profile()),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }

        final user = UserModel.fromJson(snapshot.data!);
        if (!_fieldsLoaded) {
          _firstName.text = user.firstName ?? '';
          _lastName.text = user.lastName ?? '';
          _phone.text = user.phoneE164 ?? '';
          _fieldsLoaded = true;
        }

        final displayName = [
          _firstName.text.trim(),
          _lastName.text.trim(),
        ].where((part) => part.isNotEmpty).join(' ');
        final accountType = user.role.toLowerCase() == 'driver'
            ? 'Driver account'
            : 'Rider account';
        final hasChanges = widget.phoneOnly
            ? _phone.text.trim() != (user.phoneE164 ?? '').trim()
            : _firstName.text.trim() != (user.firstName ?? '').trim() ||
                  _lastName.text.trim() != (user.lastName ?? '').trim() ||
                  _phone.text.trim() != (user.phoneE164 ?? '').trim();

        return Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 22, 16, 16),
                children: [
                  Center(
                    child: CircleAvatar(
                      radius: 43,
                      backgroundColor: const Color(0xFFF2F3F5),
                      foregroundImage: user.avatarUrl == null
                          ? null
                          : NetworkImage(user.avatarUrl!),
                      child: user.avatarUrl == null
                          ? const Icon(
                              Icons.person_outline_rounded,
                              size: 38,
                              color: RideTokens.ink,
                            )
                          : null,
                    ),
                  ),
                  const SizedBox(height: 28),
                  _ProfileGroup(
                    rows: [
                      _ProfileRowData(
                        'Name',
                        displayName.isEmpty ? 'Add your name' : displayName,
                        onTap: widget.phoneOnly ? null : _editName,
                      ),
                      _ProfileRowData('Account', accountType),
                    ],
                  ),
                  const SizedBox(height: 22),
                  const Padding(
                    padding: EdgeInsets.only(bottom: 10),
                    child: Text(
                      'Private Information',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  _ProfileGroup(
                    rows: [
                      _ProfileRowData(
                        'Email',
                        user.email?.isNotEmpty == true
                            ? user.email!
                            : 'Not provided',
                      ),
                      _ProfileRowData(
                        'Phone number',
                        _phone.text.isEmpty ? 'Add phone number' : _phone.text,
                        onTap: _editPhone,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (hasChanges)
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                  child: SizedBox(
                    width: double.infinity,
                    height: 60,
                    child: SolidButton(
                      text: widget.phoneOnly
                          ? 'Save phone number'
                          : 'Save changes',
                      onPressed: _saving ? null : () => _save(user),
                      busy: _saving,
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    ),
  );
}

class _ProfileGroup extends StatelessWidget {
  final List<_ProfileRowData> rows;
  const _ProfileGroup({required this.rows});

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    shape: RoundedRectangleBorder(
      side: const BorderSide(color: RideTokens.line),
      borderRadius: BorderRadius.circular(13),
    ),
    clipBehavior: Clip.antiAlias,
    child: Column(
      children: [
        for (var index = 0; index < rows.length; index++) ...[
          if (index > 0)
            const Padding(
              padding: EdgeInsets.only(left: 16),
              child: Divider(height: 1, color: RideTokens.line),
            ),
          _ProfileInfoRow(rows[index]),
        ],
      ],
    ),
  );
}

class _ProfileRowData {
  final String label;
  final String value;
  final VoidCallback? onTap;
  const _ProfileRowData(this.label, this.value, {this.onTap});
}

class _ProfileInfoRow extends StatelessWidget {
  final _ProfileRowData row;
  const _ProfileInfoRow(this.row);

  @override
  Widget build(BuildContext context) {
    final content = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      child: Row(
        children: [
          Flexible(
            child: Text(
              row.label,
              style: const TextStyle(color: RideTokens.muted, fontSize: 14),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: Text(
              row.value,
              textAlign: TextAlign.right,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: RideTokens.ink,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          if (row.onTap != null) ...[
            const SizedBox(width: 7),
            const Icon(Icons.chevron_right_rounded, size: 20),
          ],
        ],
      ),
    );
    if (row.onTap == null) return content;
    return InkWell(onTap: row.onTap, child: content);
  }
}

class _ProfileValueDialog extends StatefulWidget {
  final String title;
  final String initialValue;
  final String hint;
  final TextInputType keyboardType;
  final VoidCallback onCancel;
  final ValueChanged<String> onSave;

  const _ProfileValueDialog({
    required this.title,
    required this.initialValue,
    required this.hint,
    required this.keyboardType,
    required this.onCancel,
    required this.onSave,
  });

  @override
  State<_ProfileValueDialog> createState() => _ProfileValueDialogState();
}

class _ProfileValueDialogState extends State<_ProfileValueDialog> {
  late final TextEditingController _value = TextEditingController(
    text: widget.initialValue,
  );

  @override
  void dispose() {
    _value.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => LiquidGlassDialog(
    title: Text(
      'Edit ${widget.title}',
      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w500),
    ),
    content: widget.keyboardType == TextInputType.phone
        ? CountryPickerWidget(
            controller: _value,
            label: '',
            hint: 'Phone number',
            defaultCountryCode: 'IN',
            onChanged: (_) => setState(() {}),
          )
        : TextField(
            controller: _value,
            autofocus: true,
            keyboardType: widget.keyboardType,
            textCapitalization: widget.keyboardType == TextInputType.name
                ? TextCapitalization.words
                : TextCapitalization.none,
            decoration: InputDecoration(hintText: widget.hint),
            onChanged: (_) => setState(() {}),
          ),
    actions: [
      TextButton(onPressed: widget.onCancel, child: const Text('Cancel')),
      if (_value.text.trim() != widget.initialValue.trim())
        TextButton(
          onPressed: () => widget.onSave(_value.text),
          child: const Text('Save'),
        ),
    ],
  );
}
