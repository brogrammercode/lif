import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/driver_account/pages/driver_documents_page.dart';
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
  late final _repository = widget.repository ?? SettingsRepository();
  final _scroll = ScrollController();
  SettingsAccount? _account;
  String? _error;
  int _loadId = 0;
  bool _choosingPhoto = false, _savingPhoto = false, _signingOut = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final id = ++_loadId;
    if (_error != null) setState(() => _error = null);
    try {
      final account = await _repository.load();
      if (mounted && id == _loadId) setState(() => _account = account);
    } catch (error) {
      if (!mounted || id != _loadId) return;
      if (_account == null) {
        setState(() => _error = ApiResult.errorMessage(error));
      } else {
        _notice('Your profile could not be refreshed. Please try again.');
      }
    }
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

  Future<void> _documents() async {
    final account = _account;
    if (account == null) return;
    if (!account.hasDriverAccess) {
      await _open(AppRoutes.partnerProgram);
      return;
    }
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => DriverDocumentsPage(readOnly: account.exited),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _vehicles() async {
    final account = _account;
    if (account == null) return;
    await _open(
      account.exited
          ? AppRoutes.driverAccount
          : account.hasDriverAccess
          ? AppRoutes.driverVehicles
          : AppRoutes.partnerProgram,
    );
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

  Widget _menu() => Column(
    children: [
      SettingsProfileHeader(
        user: _account!.user,
        onEditPhoto: _photo,
        savingPhoto: _savingPhoto,
      ),
      for (final tile in [
        SettingsMenuTile(
          icon: Icons.badge_outlined,
          title: 'Personal Information',
          subtitle: 'Name, email, phone',
          onTap: () => _open(AppRoutes.profile),
        ),
        SettingsMenuTile(
          icon: Icons.description_outlined,
          title: 'Documents',
          subtitle: _account!.hasDriverAccess
              ? 'RC, insurance and PUC'
              : 'Application & verification',
          onTap: _documents,
        ),
        SettingsMenuTile(
          icon: Icons.directions_car_outlined,
          title: 'Saved Vehicles',
          subtitle: _account!.exited
              ? 'View your vehicle records'
              : _account!.hasDriverAccess
              ? 'Manage your registered vehicles'
              : 'Add vehicles through Partner Program',
          onTap: _vehicles,
        ),
        SettingsMenuTile(
          icon: Icons.credit_card_outlined,
          title: 'Payment Methods',
          subtitle: 'Manage your payment options',
          onTap: () => _open(AppRoutes.paymentMethods),
        ),
        SettingsMenuTile(
          icon: Icons.settings_outlined,
          title: 'Settings',
          subtitle: 'Notifications, safety and support',
          onTap: _settings,
        ),
      ])
        Padding(
          padding: const EdgeInsets.only(bottom: SettingsStyle.tileGap),
          child: tile,
        ),
    ],
  );

  @override
  Widget build(BuildContext context) => LiquidGlassScope(
    child: Semantics(
      namesRoute: true,
      label: 'Profile settings',
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: LiquidGlassBackdrop(
          child: SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 4,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      LiquidGlassIconButton(
                        icon: Icons.chevron_left,
                        tooltip: 'Back',
                        onPressed: () async {
                          if (!await Navigator.maybePop(context) && mounted) {
                            _home();
                          }
                        },
                      ),
                      LiquidGlassIconButton(
                        icon: Icons.settings_outlined,
                        tooltip: 'Account settings',
                        onPressed: _settings,
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: _error != null && _account == null
                      ? AppLoadError(message: _error!, onRetry: _load)
                      : SingleChildScrollView(
                          controller: _scroll,
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                          child: Center(
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 480),
                              child: _account == null
                                  ? const SettingsSkeleton()
                                  : _menu(),
                            ),
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
