import 'package:user/features/profile/controllers/profile_controller.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class ProfilePage extends StatefulWidget {
  final UserAppRepository? repository;
  const ProfilePage({super.key, this.repository});
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
  final _form = GlobalKey<FormState>();
  final TextEditingController _firstName = TextEditingController();
  final TextEditingController _lastName = TextEditingController();
  final TextEditingController _phone = TextEditingController();
  final TextEditingController _email = TextEditingController();
  Future<Map<String, dynamic>> get _profile => _controller.profile;
  set _profile(Future<Map<String, dynamic>> value) =>
      _controller.profile = value;
  bool get _saving => _controller.saving;
  set _saving(bool value) => _controller.saving = value;
  bool _fieldsLoaded = false;

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await _repository.updateProfile({
        'first_name': _firstName.text.trim(),
        'last_name': _lastName.text.trim(),
        if (_phone.text.trim().isNotEmpty) 'phone_e164': _phone.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(UserAppCopy.PROFILE_SAVED)));
      setState(() {
        _profile = _repository.profile();
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
    glass: true,
    title: UserAppCopy.PROFILE,
    child: FutureBuilder<Map<String, dynamic>>(
      future: _profile,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: () => setState(() {
              _profile = _repository.profile();
            }),
          );
        }
        if (!snapshot.hasData) {
          return const LiquidGlassFormSkeleton();
        }
        final user = UserModel.fromJson(snapshot.data!);
        if (!_fieldsLoaded) {
          _firstName.text = user.firstName ?? '';
          _lastName.text = user.lastName ?? '';
          _phone.text = user.phoneE164 ?? '';
          _email.text = user.email ?? '';
          _fieldsLoaded = true;
        }
        return ListView(
          padding: EdgeInsets.only(top: 6.h, bottom: 24.h),
          children: [
            LiquidGlassSurface(
              child: Column(
                children: [
                  LiquidGlassSurface(
                    radius: 99,
                    padding: const EdgeInsets.all(4),
                    child: CircleAvatar(
                      radius: 46.r,
                      backgroundColor: const Color(0x407E8EAB),
                      backgroundImage: user.avatarUrl == null
                          ? null
                          : NetworkImage(user.avatarUrl!),
                      child: user.avatarUrl == null
                          ? Icon(
                              Icons.person_outline_rounded,
                              size: 38.w,
                              color: GlassTokens.accent,
                            )
                          : null,
                    ),
                  ),
                  SizedBox(height: 14.h),
                  Text(
                    [
                      user.firstName,
                      user.lastName,
                    ].whereType<String>().where((v) => v.isNotEmpty).join(' '),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: GlassTokens.ink,
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    user.email ?? 'Signed-in 1More account',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: GlassTokens.muted,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Change your profile photo from Settings. Your email is linked to Google and cannot be edited here.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: GlassTokens.muted,
                      fontSize: 12,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(height: 20.h),
            AppCard(
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Personal information',
                      style: TextStyle(
                        color: GlassTokens.ink,
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 5),
                    const Text(
                      'Used for ride communication, receipts and account support.',
                      style: TextStyle(
                        color: GlassTokens.muted,
                        fontSize: 12.5,
                        height: 1.4,
                      ),
                    ),
                    SizedBox(height: 20.h),
                    _field(
                      UserAppCopy.FIRST_NAME,
                      _firstName,
                      validator: _requiredName,
                    ),
                    _field(
                      UserAppCopy.LAST_NAME,
                      _lastName,
                      validator: _requiredName,
                    ),
                    _field(UserAppCopy.EMAIL, _email, enabled: false),
                    _field(
                      UserAppCopy.PHONE,
                      _phone,
                      keyboardType: TextInputType.phone,
                      hint: '+919876543210',
                      validator: _phoneNumber,
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(height: 20.h),
            AppButton(
              text: UserAppCopy.SAVE_CHANGES,
              onPressed: _save,
              isLoading: _saving,
            ),
          ],
        );
      },
    ),
  );

  Widget _field(
    String label,
    TextEditingController controller, {
    bool enabled = true,
    TextInputType? keyboardType,
    String? hint,
    String? Function(String?)? validator,
  }) => Padding(
    padding: EdgeInsets.only(bottom: 18.h),
    child: TextFormField(
      controller: controller,
      enabled: enabled,
      keyboardType: keyboardType,
      validator: validator,
      textInputAction: keyboardType == TextInputType.phone
          ? TextInputAction.done
          : TextInputAction.next,
      decoration: InputDecoration(labelText: label, hintText: hint),
    ),
  );

  String? _requiredName(String? value) => value == null || value.trim().isEmpty
      ? 'Enter this name'
      : value.trim().length > 80
      ? 'Use 80 characters or fewer'
      : null;

  String? _phoneNumber(String? value) {
    final phone = value?.trim() ?? '';
    if (phone.isEmpty) return null;
    return RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(phone)
        ? null
        : 'Use international format, for example +919876543210';
  }
}
