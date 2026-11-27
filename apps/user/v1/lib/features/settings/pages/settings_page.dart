import 'package:user/features/rides/ride_display.dart' show rideMoney;
import 'package:user/features/settings/controllers/settings_controller.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/support/pages/complaint_chat_page.dart';
import 'package:user/features/support/pages/faq_page.dart';
import 'package:user/features/profile/pages/profile_page.dart';
import 'package:user/features/partner_program/pages/driver_exit_page.dart';
import 'package:user/features/settings/widgets/profile_overview.dart';
import 'dart:async';
import 'dart:io';
import 'package:user/features/settings/pages/wallet_page.dart';
import 'package:user/features/settings/widgets/wallet_feedback.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/solid_file_upload.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/app_mode.repo.dart';

import 'package:user/features/settings/settings.repo.dart';

import 'package:user/features/settings/widgets/settings_profile.dart';
import 'package:user/features/driver_account/pages/driver_documents_page.dart';

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
  bool _choosingPhoto = false, _savingPhoto = false;

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

  Future<void> _signOut() async {
    if (_controller.signingOut) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => LiquidGlassDialog(
        title: const Text('Log out?'),
        content: const Text('Are you sure you want to log out of 1More?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.black),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await _controller.signOut();
      if (!mounted) return;
      Navigator.pushNamedAndRemoveUntil(context, AppRoutes.login, (_) => false);
    } catch (error) {
      _notice(ApiResult.errorMessage(error));
    }
  }

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
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w400),
                  ),
                  const SizedBox(height: 18),
                  SettingsMenuTile(
                    icon: Icons.camera_alt_outlined,
                    title: 'Take a photo',
                    subtitle: 'Use your camera',
                    titleWeight: FontWeight.w400,
                    onTap: () => Navigator.pop(context, ImageSource.camera),
                  ),
                  const SizedBox(height: 10),
                  SettingsMenuTile(
                    icon: Icons.photo_library_outlined,
                    title: 'Choose from photos',
                    subtitle: 'JPEG, PNG or WebP · Up to 3 MB',
                    titleWeight: FontWeight.w400,
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
          content: SolidFileUpload(
            label: 'Profile photo',
            files: [
              SolidUploadFile(
                name: photo.name,
                path: photo.path,
                onRemove: () => Navigator.pop(context, false),
              ),
            ],
            image: true,
            camera: false,
            busy: false,
            onChoose: null,
            limitText: 'JPEG, PNG, or WebP · up to 3 MB',
            showGuidance: false,
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

  void _information(String title, String body) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => SolidPage(
          title: title,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Text(
              body,
              style: const TextStyle(
                fontSize: 14,
                height: 1.6,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _editProfile() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => SolidScope(child: const ProfilePage())),
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
                        WalletErrorNotice(
                          message: _controller.walletProfileError,
                          child: ProfileStat(
                            icon: driver
                                ? Icons.payments_outlined
                                : Icons.account_balance_wallet_outlined,
                            title: driver ? 'Total Earning' : 'Wallet',
                            loading:
                                _controller.walletProfilePaise == null &&
                                _controller.walletProfileLoading,
                            value: _controller.walletProfilePaise == null
                                ? 'Unavailable'
                                : rideMoney(
                                    _controller.walletProfilePaise! / 100,
                                  ),
                          ),
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
                              : rideMoney(stats['money_saved']),
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
            style: const TextStyle(
              fontSize: 12,
              color: RideTokens.muted,
              fontWeight: FontWeight.w500,
            ),
          ),
        ProfileSection(
          title: 'Personal',
          children: [
            row(Icons.person_outline, 'Edit Profile', () => _editProfile()),
            row(
              Icons.route_outlined,
              'My Rides',
              () => _open(driver ? AppRoutes.driverRides : AppRoutes.rides),
            ),
            if (!driver && account.user.hasPartnerExit)
              row(
                Icons.history_rounded,
                'Past Driver Rides',
                () => _open(AppRoutes.driverRides),
              ),
            row(Icons.account_balance_wallet_outlined, 'My Wallet', () async {
              await Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      WalletPage(controller: _controller, driver: driver),
                ),
              );
              if (mounted) await _controller.refreshWalletAmount();
            }),
            if (driver) ...[
              row(
                Icons.directions_car_outlined,
                'My Vehicles',
                () => _open(AppRoutes.driverVehicles),
              ),
              row(
                Icons.folder_copy_outlined,
                'My Documents',
                () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const DriverDocumentsPage(),
                  ),
                ),
              ),
            ],
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
            if (driver) ...[
              row(
                Icons.verified_outlined,
                'Confirmation',
                () => _open(AppRoutes.partnerProgram),
              ),
              row(
                Icons.exit_to_app_outlined,
                'Exit and Dues',
                () => _open(AppRoutes.driverExit),
              ),
            ] else
              row(
                Icons.handshake_outlined,
                'Become our Driving Partner',
                () => _open(AppRoutes.partnerProgram),
              ),
            if (account.user.hasPartnerExit)
              row(
                Icons.receipt_long_outlined,
                'Past Driver Settlements',
                () => Navigator.push<void>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const DriverExitPage(historyOnly: true),
                  ),
                ),
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
                  builder: (_) => const SolidScope(child: ComplaintChatPage()),
                ),
              ),
            ),
            row(
              Icons.quiz_outlined,
              'FAQ',
              () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      SolidScope(child: FaqPage(entries: _controller.faq)),
                ),
              ),
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
        ProfileSection(
          title: 'Account',
          children: [
            ProfileRow(
              icon: Icons.logout_rounded,
              title: _controller.signingOut ? 'Logging out' : 'Log out',
              onTap: _controller.signingOut ? null : _signOut,
              busy: _controller.signingOut,
            ),
          ],
        ),
        const SizedBox(height: 20),
      ],
    );
  }

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'Profile',
    onBack: () async {
      if (!await Navigator.maybePop(context) && mounted) _home();
    },
    child: RefreshIndicator(
      onRefresh: _load,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: _account == null
                ? (_error == null
                      ? const ProfileOverviewSkeleton()
                      : AppLoadError(message: _error!, onRetry: _load))
                : _menu(),
          ),
        ),
      ),
    ),
  );
}
