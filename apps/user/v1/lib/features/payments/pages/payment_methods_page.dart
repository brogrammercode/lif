import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/settings/widgets/settings_secondary.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class PaymentMethodsPage extends StatefulWidget {
  final UserAppRepository? repository;
  const PaymentMethodsPage({super.key, this.repository});

  @override
  State<PaymentMethodsPage> createState() => _PaymentMethodsPageState();
}

class _PaymentMethodsPageState extends State<PaymentMethodsPage> {
  late final UserAppRepository _repository =
      widget.repository ?? UserAppRepository();
  List<Map<String, dynamic>> _methods = const [];
  Object? _error;
  bool _loading = true;
  bool _saving = false;
  int _generation = 0;

  bool get _hasCash => _methods.any((method) => method['type'] == 'CASH');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool preserve = false}) async {
    final generation = ++_generation;
    if (!preserve && mounted) setState(() => _loading = true);
    try {
      final value = await _repository.paymentMethods();
      if (!mounted || generation != _generation) return;
      setState(() {
        _methods = value;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      if (preserve && _methods.isNotEmpty) {
        _showError(error);
        return;
      }
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _addCash() async {
    if (_saving || _hasCash) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => LiquidGlassDialog(
        title: const Text('Use cash for rides?'),
        content: const Text(
          'Cash is paid directly to the assigned driver after the ride. 1More records the method, but the driver confirms collection.',
          style: TextStyle(color: GlassTokens.muted, height: 1.45),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Add cash'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _saving = true);
    try {
      await _repository.addPaymentMethod({'type': 'CASH', 'is_default': true});
      await _load(preserve: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cash added as a payment method.')),
        );
      }
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _remove(Map<String, dynamic> method) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => LiquidGlassDialog(
        title: const Text('Remove payment method?'),
        content: Text(
          '${_label(method)} will no longer be available for new rides. Existing ride records are retained.',
          style: const TextStyle(color: GlassTokens.muted, height: 1.45),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep method'),
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
      await _repository.deletePaymentMethod('${method['id']}');
      await _load(preserve: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payment method removed.')),
        );
      }
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showError(Object error) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.PAYMENT_METHODS,
    glass: true,
    scrollable: true,
    action: !_loading && !_hasCash
        ? IconButton(
            tooltip: 'Add cash method',
            onPressed: _saving ? null : _addCash,
            icon: const Icon(
              Icons.add_card_outlined,
              color: GlassTokens.accent,
            ),
          )
        : null,
    child: _body(),
  );

  Widget _body() {
    if (_loading && _methods.isEmpty) {
      return const SettingsListSkeleton(rows: 3);
    }
    if (_error != null && _methods.isEmpty) {
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
            icon: Icons.account_balance_wallet_outlined,
            title: 'Pay the driver directly',
            body:
                'At launch, fares go directly to your driver by cash or the driver’s registered UPI. 1More currently takes no commission or platform fee.',
            footer: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: const [
                SettingsStatusPill(
                  label: 'Cash',
                  color: Color(0xFF397864),
                  icon: Icons.payments_outlined,
                ),
                SettingsStatusPill(
                  label: 'Direct UPI',
                  color: GlassTokens.accent,
                  icon: Icons.qr_code_rounded,
                ),
                SettingsStatusPill(
                  label: 'Zero commission',
                  color: Color(0xFF785B9B),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          const SettingsSectionHeader(
            title: 'How payment works',
            helper: 'Choose an available method for each ride.',
          ),
          const SizedBox(height: 12),
          _availability(
            icon: Icons.payments_outlined,
            title: 'Cash',
            body:
                'Pay the assigned driver after the ride. The driver confirms collection in 1More.',
            status: 'Available',
            statusColor: const Color(0xFF397864),
          ),
          const SizedBox(height: 12),
          _availability(
            icon: Icons.qr_code_2_rounded,
            title: 'Direct UPI',
            body:
                'Pay the driver’s registered UPI after the ride when the selected vehicle category enables it. Opening a UPI app is not proof of payment.',
            status: 'Per ride',
            statusColor: GlassTokens.accent,
          ),
          const SizedBox(height: 12),
          _availability(
            icon: Icons.credit_card_off_outlined,
            title: 'In-app card and wallet',
            body:
                'Provider-managed online collection is not enabled yet. No card or wallet details are collected by this screen.',
            status: 'Coming later',
            statusColor: GlassTokens.muted,
          ),
          const SizedBox(height: 24),
          SettingsSectionHeader(
            title: 'Saved methods',
            helper: _methods.isEmpty
                ? 'No method has been saved to your account.'
                : '${_methods.length} ${_methods.length == 1 ? 'method' : 'methods'} available for checkout.',
          ),
          const SizedBox(height: 12),
          if (_methods.isEmpty)
            SettingsEmptyCard(
              icon: Icons.wallet_outlined,
              title: UserAppCopy.EMPTY_PAYMENTS,
              body: UserAppCopy.EMPTY_PAYMENTS_DESCRIPTION,
              action: LiquidGlassButton(
                text: 'Add cash method',
                icon: const Icon(Icons.add),
                onPressed: _saving ? null : _addCash,
                busy: _saving,
              ),
            )
          else
            for (var index = 0; index < _methods.length; index++) ...[
              _method(_methods[index]),
              if (index != _methods.length - 1) const SizedBox(height: 12),
            ],
          const SizedBox(height: 18),
          const Text(
            'Never share an OTP, PIN or UPI PIN with a driver or support agent. Unpaid or disputed rides can be reported from My rides.',
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

  Widget _availability({
    required IconData icon,
    required String title,
    required String body,
    required String status,
    required Color statusColor,
  }) => LiquidGlassSurface(
    padding: const EdgeInsets.all(17),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        LiquidGlassSurface(
          radius: 99,
          padding: const EdgeInsets.all(11),
          child: Icon(icon, color: statusColor, size: 21),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        color: GlassTokens.ink,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  SettingsStatusPill(label: status, color: statusColor),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                body,
                style: const TextStyle(
                  color: GlassTokens.muted,
                  fontSize: 12,
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _method(Map<String, dynamic> method) {
    final type = '${method['type'] ?? ''}';
    final provider = '${method['provider'] ?? ''}'.trim();
    return LiquidGlassSurface(
      padding: const EdgeInsets.all(17),
      child: Row(
        children: [
          LiquidGlassSurface(
            radius: 99,
            padding: const EdgeInsets.all(11),
            child: Icon(_icon(type), size: 21, color: GlassTokens.accent),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _label(method),
                  style: const TextStyle(
                    color: GlassTokens.ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 7),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    SettingsStatusPill(
                      label: readableEnum(type),
                      color: GlassTokens.accent,
                    ),
                    if (method['is_default'] == true)
                      const SettingsStatusPill(
                        label: 'Default',
                        color: Color(0xFF397864),
                        icon: Icons.check,
                      ),
                    if (provider.isNotEmpty)
                      SettingsStatusPill(
                        label: provider,
                        color: GlassTokens.muted,
                      ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Remove ${_label(method)}',
            onPressed: _saving ? null : () => _remove(method),
            icon: const Icon(Icons.delete_outline, color: GlassTokens.muted),
          ),
        ],
      ),
    );
  }

  String _label(Map<String, dynamic> method) {
    final type = '${method['type'] ?? ''}';
    return switch (type) {
      'CARD' =>
        '${method['card_brand'] ?? 'Card'} •••• ${method['card_last4'] ?? ''}',
      'UPI' => '${method['upi_handle'] ?? 'UPI method'}',
      'WALLET' => '${method['provider'] ?? 'Wallet'}',
      _ => 'Cash',
    };
  }

  IconData _icon(String type) => switch (type) {
    'CARD' => Icons.credit_card,
    'UPI' => Icons.qr_code_2_rounded,
    'WALLET' => Icons.account_balance_wallet_outlined,
    _ => Icons.payments_outlined,
  };
}
