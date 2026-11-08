import 'package:user/features/settings/controllers/app_mode_controller.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/auth/models/user.model.dart';

class AppModeTile extends StatefulWidget {
  final UserModel user;
  final AppMode? initialMode;
  const AppModeTile({super.key, required this.user, this.initialMode});
  @override
  State<AppModeTile> createState() => _AppModeTileState();
}

class _AppModeTileState extends State<AppModeTile> {
  late final _controller = AppModeController(widget.user, widget.initialMode)
    ..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  AppModeRepository get _modes => _controller.modes;
  Future<AppMode> get _mode => _controller.mode;
  bool get _busy => _controller.busy;
  Future<void> _switch(AppMode current) async {
    try {
      if (await _controller.switchMode(current) && mounted) {
        Navigator.pushNamedAndRemoveUntil(
          context,
          AppRoutes.gate,
          (_) => false,
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_modes.canEnterDriver(widget.user)) return const SizedBox.shrink();
    return FutureBuilder<AppMode>(
      future: _mode,
      initialData: widget.initialMode,
      builder: (context, snapshot) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: AppCard(
          child: Material(
            type: MaterialType.transparency,
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(
                Icons.directions_car_outlined,
                color: AppColors.primaryGreen,
              ),
              title: Text(
                !snapshot.hasData
                    ? 'Rider / driver mode'
                    : snapshot.data == AppMode.driver
                    ? 'Switch to rider'
                    : 'Switch to driver',
              ),
              subtitle: Text(
                snapshot.hasError
                    ? 'Mode preference could not be loaded.'
                    : 'One account. Separate rider and driver journeys.',
              ),
              trailing: _busy
                  ? const AppSkeleton(
                      label: 'Switching mode',
                      child: SkeletonBox(width: 20, height: 14),
                    )
                  : const Icon(Icons.chevron_right),
              onTap: _busy || !snapshot.hasData
                  ? null
                  : () => _switch(snapshot.data!),
            ),
          ),
        ),
      ),
    );
  }
}
