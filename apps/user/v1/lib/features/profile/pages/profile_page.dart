import 'package:user/components/ui/liquid_glass.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final UserAppRepository _repository = UserAppRepository();
  final TextEditingController _firstName = TextEditingController();
  final TextEditingController _lastName = TextEditingController();
  final TextEditingController _phone = TextEditingController();
  final TextEditingController _email = TextEditingController();
  late Future<Map<String, dynamic>> _profile = _repository.profile();
  bool _saving = false;
  bool _fieldsLoaded = false;

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
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
          padding: EdgeInsets.only(bottom: 24.h),
          children: [
            SizedBox(height: 8.h),
            Center(
              child: CircleAvatar(
                radius: 42.r,
                backgroundColor: AppColors.softGrey,
                backgroundImage: user.avatarUrl == null
                    ? null
                    : NetworkImage(user.avatarUrl!),
                child: user.avatarUrl == null
                    ? Icon(
                        Icons.person_outline,
                        size: 36.w,
                        color: AppColors.primaryGreen,
                      )
                    : null,
              ),
            ),
            SizedBox(height: 24.h),
            AppSectionLabel(UserAppCopy.PROFILE),
            SizedBox(height: 12.h),
            _field(UserAppCopy.FIRST_NAME, _firstName),
            _field(UserAppCopy.LAST_NAME, _lastName),
            _field(UserAppCopy.EMAIL, _email, enabled: false),
            _field(
              UserAppCopy.PHONE,
              _phone,
              keyboardType: TextInputType.phone,
              hint: '+919876543210',
            ),
            SizedBox(height: 12.h),
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
  }) => Padding(
    padding: EdgeInsets.only(bottom: 14.h),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13.sp,
            fontWeight: FontWeight.w700,
            color: AppColors.textSecondary,
          ),
        ),
        SizedBox(height: 7.h),
        LiquidGlassSurface(
          padding: EdgeInsets.zero,
          radius: 20,
          child: TextField(
            controller: controller,
            enabled: enabled,
            keyboardType: keyboardType,
            decoration: InputDecoration(
              hintText: hint,
              filled: true,
              fillColor: enabled
                  ? const Color(0x18FFFFFF)
                  : const Color(0x307E8EAB),
              border: GlassTokens.inputBorder,
              enabledBorder: GlassTokens.inputBorder,
              contentPadding: EdgeInsets.symmetric(
                horizontal: 14.w,
                vertical: 15.h,
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
