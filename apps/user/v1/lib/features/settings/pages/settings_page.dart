import 'package:user/features/settings/controllers/settings_controller.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/support/pages/support_page.dart';
import 'package:user/features/profile/pages/profile_page.dart';
import 'package:user/features/settings/widgets/profile_overview.dart';
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/app_mode.repo.dart';

import 'package:user/features/settings/settings.repo.dart';
import 'package:user/features/settings/widgets/app_mode_tile.dart';
import 'package:user/features/settings/widgets/settings_profile.dart';
import 'package:user/features/user_app/user_app.constant.dart';

class SettingsPage extends StatefulWidget {
  final SettingsRepository? repository;
  final Future<XFile?> Function(ImageSource)? selectPhoto;
  const SettingsPage({super.key, this.repository, this.selectPhoto});
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late final _controller = SettingsController(
    widget.repository ?? SettingsRepository(),
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  SettingsRepository get _repository => _controller.repository;
  final _scroll = ScrollController();
  SettingsAccount? get _account => _controller.account;
  String? get _error => _controller.error;
  bool _choosingPhoto = false, _savingPhoto = false, _signingOut = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    await _controller.load();
    final notice = _controller.notice;
    _controller.notice = null;
    if (notice != null) _notice(notice);
  }

  void _notice(String text) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  Future<void> _open(String route) async {
    await Navigator.pushNamed(context, route);
    if (mounted) await _load();
  }

  // Back at the root restores the selected mode and any active trip through
  // SessionGate, preserving the existing account and vehicle gates.
  void _home() =>
      Navigator.pushNamedAndRemoveUntil(context, AppRoutes.gate, (_) => false);

  Future<void> _photo() async {
    if (_choosingPhoto || _savingPhoto || _account == null) return;
    _choosingPhoto = true;
    try {
      final source = await showModalBottomSheet<ImageSource>(
        context: context,
        showDragHandle: false,
        backgroundColor: Colors.transparent,
        builder: (context) => LiquidGlassSheet(
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Profile photo',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 18),
                  SettingsMenuTile(
                    icon: Icons.camera_alt_outlined,
                    title: 'Take a photo',
                    subtitle: 'Use your camera',
                    onTap: () => Navigator.pop(context, ImageSource.camera),
                  ),
                  const SizedBox(height: 10),
                  SettingsMenuTile(
                    icon: Icons.photo_library_outlined,
                    title: 'Choose from photos',
                    subtitle: 'JPEG, PNG or WebP · Up to 3 MB',
                    onTap: () => Navigator.pop(context, ImageSource.gallery),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      if (source == null || !mounted) return;
      final photo = widget.selectPhoto != null
          ? await widget.selectPhoto!(source)
          : await ImagePicker().pickImage(
              source: source,
              maxWidth: 1200,
              maxHeight: 1200,
              imageQuality: 85,
              requestFullMetadata: false,
            );
      if (photo == null || !mounted) return;
      final file = File(photo.path);
      final size = await file.length();
      if (size == 0 || size > 3000000) {
        throw StateError('Choose a profile photo up to 3 MB.');
      }
      if (!mounted) return;
      final save = await showDialog<bool>(
        context: context,
        builder: (context) => LiquidGlassDialog(
          title: const Text('Use this profile photo?'),
          content: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Image.file(
              file,
              width: 240,
              height: 240,
              cacheWidth: 600,
              fit: BoxFit.cover,
              errorBuilder: (_, error, stack) => const SizedBox(
                height: 180,
                child: Center(
                  child: Text('This image could not be previewed.'),
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save photo'),
            ),
          ],
        ),
      );
      if (save != true || !mounted) return;
      setState(() => _savingPhoto = true);
      await _repository.savePhoto(photo.path, photo.name);
      if (mounted) {
        await _load();
        _notice('Your profile photo has been updated.');
      }
    } catch (error) {
      _notice(ApiResult.errorMessage(error));
    } finally {
      _choosingPhoto = false;
      if (mounted) setState(() => _savingPhoto = false);
    }
  }

  Future<void> _signOut() async {
    if (_signingOut || _savingPhoto) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => LiquidGlassDialog(
        title: const Text(UserAppCopy.LOG_OUT),
        content: const Text(UserAppCopy.LOG_OUT_CONFIRMATION),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text(UserAppCopy.LOG_OUT),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _signingOut = true);
    try {
      await _repository.signOut();
      if (mounted) {
        Navigator.pushNamedAndRemoveUntil(
          context,
          AppRoutes.login,
          (_) => false,
        );
      }
    } catch (error) {
      _notice(ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _signingOut = false);
    }
  }

  void _settings() {
    final account = _account;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: false,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.88,
      ),
      builder: (sheetContext) {
        void open(String route) {
          Navigator.pop(sheetContext);
          unawaited(_open(route));
        }

        Widget tile(
          IconData icon,
          String title,
          String subtitle,
          String route,
        ) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: SettingsMenuTile(
            icon: icon,
            title: title,
            subtitle: subtitle,
            onTap: () => open(route),
          ),
        );
        return LiquidGlassSheet(
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Settings',
                    style: TextStyle(fontSize: 23, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    account == null
                        ? 'Your 1More account'
                        : 'Account ID ${account.user.id}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: SettingsStyle.muted,
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (account?.hasDriverAccess == true)
                    AppModeTile(user: account!.user, initialMode: account.mode),
                  tile(
                    Icons.handshake_outlined,
                    'Partner Program',
                    'Application, verification and status',
                    AppRoutes.partnerProgram,
                  ),
                  if (account?.hasDriverAccess == true)
                    tile(
                      Icons.account_balance_wallet_outlined,
                      'Driver account & earnings',
                      'Payout details, statements and requests',
                      AppRoutes.driverAccount,
                    ),
                  if (account != null)
                    tile(
                      Icons.history,
                      account.mode == AppMode.driver
                          ? 'Driver trips'
                          : UserAppCopy.RIDES,
                      'Your journeys and ride history',
                      account.mode == AppMode.driver
                          ? AppRoutes.driverRides
                          : AppRoutes.rides,
                    ),
                  tile(
                    Icons.place_outlined,
                    UserAppCopy.SAVED_PLACES,
                    'Home, work and favourite places',
                    AppRoutes.savedPlaces,
                  ),
                  tile(
                    Icons.notifications_none,
                    UserAppCopy.NOTIFICATIONS,
                    'Ride and account updates',
                    AppRoutes.notifications,
                  ),
                  tile(
                    Icons.health_and_safety_outlined,
                    UserAppCopy.EMERGENCY_CONTACTS,
                    'People you can reach in an emergency',
                    AppRoutes.emergencyContacts,
                  ),
                  tile(
                    Icons.support_agent,
                    UserAppCopy.SUPPORT,
                    'Get in touch with the 1More team',
                    AppRoutes.support,
                  ),
                  SettingsMenuTile(
                    icon: Icons.logout,
                    title: _signingOut ? 'Signing out…' : UserAppCopy.LOG_OUT,
                    subtitle: 'Sign out of this account on this device',
                    destructive: true,
                    onTap: _signingOut || _savingPhoto
                        ? null
                        : () {
                            Navigator.pop(sheetContext);
                            unawaited(_signOut());
                          },
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  void _information(String title, String body) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => SolidScope(
          child: Scaffold(
            appBar: AppBar(title: Text(title)),
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Text(
                body,
                style: const TextStyle(fontSize: 14, height: 1.6),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _editProfile({bool phoneOnly = false}) async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => SolidScope(child: ProfilePage(phoneOnly: phoneOnly)),
      ),
    );
    if (mounted) await _load();
  }

  Widget _menu() {
    final account = _account!;
    final driver = account.mode == AppMode.driver && account.hasDriverAccess;
    final stats = _controller.summary;
    String distance(String key) {
      final value = num.tryParse('${stats[key]}');
      return value == null
          ? 'Not recorded'
          : '${(value / 1000).toStringAsFixed(1)} km';
    }

    final brand = stats['vehicle_brand'];
    Widget row(IconData icon, String title, VoidCallback tap) =>
        ProfileRow(icon: icon, title: title, onTap: tap);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfileIdentity(
          user: account.user,
          brand: driver
              ? (brand is Map
                    ? Map<String, dynamic>.from(brand)
                    : <String, dynamic>{})
              : null,
          onPhoto: _photo,
          busy: _savingPhoto,
        ),
        for (var index = 0; index < 2; index++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var column = 0; column < 2; column++) ...[
                    if (column == 1) const SizedBox(width: 8),
                    Expanded(
                      child: [
                        ProfileStat(
                          icon: driver
                              ? Icons.payments_outlined
                              : Icons.account_balance_wallet_outlined,
                          title: driver ? 'Total Earning' : 'Wallet',
                          value: driver
                              ? (stats['total_earnings'] == null
                                    ? 'Unavailable'
                                    : 'INR ${num.tryParse('${stats['total_earnings']}')?.toStringAsFixed(2) ?? '?'}')
                              : 'INR ${stats['wallet']}',
                        ),
                        ProfileStat(
                          icon: Icons.route_outlined,
                          title: 'Ride Milestone',
                          value: distance(
                            driver ? 'driver_distance_m' : 'rider_distance_m',
                          ),
                        ),
                        ProfileStat(
                          icon: driver
                              ? Icons.straighten_outlined
                              : Icons.explore_outlined,
                          title: driver
                              ? 'Longest Covered Distance'
                              : 'Place Explored',
                          value: driver
                              ? distance('longest_distance_m')
                              : '${stats['places_explored'] ?? '?'}',
                        ),
                        ProfileStat(
                          icon: driver
                              ? Icons.hourglass_empty
                              : Icons.savings_outlined,
                          title: driver ? 'Pending' : 'Money Saved',
                          value: driver
                              ? 'Pending'
                              : 'INR ${stats['money_saved']}',
                        ),
                      ][index * 2 + column],
                    ),
                  ],
                ],
              ),
            ),
          ),
        if (_controller.summaryError != null)
          Text(
            _controller.summaryError!,
            style: const TextStyle(fontSize: 12, color: RideTokens.muted),
          ),
        ProfileSection(
          title: 'Personal',
          children: [
            row(Icons.person_outline, 'Edit Profile', () => _editProfile()),
            row(
              Icons.phone_android_outlined,
              'Change Phone Number',
              () => _editProfile(phoneOnly: true),
            ),
            row(
              Icons.place_outlined,
              'Saved Places',
              () => _open(AppRoutes.savedPlaces),
            ),
          ],
        ),
        ProfileSection(
          title: 'Partner Program',
          children: [
            row(
              Icons.info_outline,
              'About Partner Program',
              () => _information(
                'About Partner Program',
                _controller.partnerInformation,
              ),
            ),
            row(
              Icons.handshake_outlined,
              'Apply',
              () => _open(AppRoutes.partnerProgram),
            ),
          ],
        ),
        ProfileSection(
          title: 'Help & Support',
          children: [
            row(
              Icons.contacts_outlined,
              'Emergency Contacts',
              () => _open(AppRoutes.emergencyContacts),
            ),
            row(Icons.support_agent, 'Help Me', () => _open(AppRoutes.support)),
            row(
              Icons.report_problem_outlined,
              'Report a Complaint',
              () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      const SolidScope(child: SupportPage(openRequest: true)),
                ),
              ),
            ),
            row(
              Icons.quiz_outlined,
              'FAQ',
              () => _information('FAQ', _controller.faq),
            ),
          ],
        ),
        ProfileSection(
          title: 'About',
          children: [
            row(
              Icons.privacy_tip_outlined,
              'Privacy Policy',
              () => _information(
                'Privacy Policy',
                _controller.privacyInformation,
              ),
            ),
            row(
              Icons.description_outlined,
              'Terms of Service',
              () => _information(
                'Terms of Service',
                _controller.termsInformation,
              ),
            ),
            ProfileRow(
              icon: Icons.info_outline,
              title: _controller.version.isEmpty
                  ? 'Version unavailable'
                  : 'Version ${_controller.version}',
            ),
          ],
        ),
        const SizedBox(height: 20),
      ],
    );
  }

  @override
  Widget build(BuildContext context) => SolidScope(
    child: Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 6, 8, 12),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Back',
                    color: Colors.white,
                    icon: const Icon(Icons.chevron_left),
                    onPressed: () async {
                      if (!await Navigator.maybePop(context) && mounted) {
                        _home();
                      }
                    },
                  ),
                  const Expanded(
                    child: Text(
                      'Profile',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Account options',
                    color: Colors.white,
                    icon: const Icon(Icons.more_horiz),
                    onPressed: _settings,
                  ),
                ],
              ),
            ),
            Expanded(
              child: Container(
                clipBehavior: Clip.antiAlias,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                ),
                child: RefreshIndicator(
                  onRefresh: _load,
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 480),
                        child: _account == null
                            ? (_error == null
                                  ? const ProfileOverviewSkeleton()
                                  : AppLoadError(
                                      message: _error!,
                                      onRetry: _load,
                                    ))
                            : _menu(),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
