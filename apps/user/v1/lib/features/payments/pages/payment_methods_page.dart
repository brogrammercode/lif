import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/payments/controllers/payment_methods_controller.dart';
import 'package:user/features/settings/widgets/settings_secondary.dart';
import 'package:user/features/settings/pages/wallet_add_money_page.dart';
import 'package:user/features/settings/widgets/wallet_sheet.dart';
import 'package:user/features/settings/widgets/wallet_feedback.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class PaymentMethodsPage extends StatefulWidget {
  final UserAppRepository? repository;
  const PaymentMethodsPage({super.key, this.repository});

  @override
  State<PaymentMethodsPage> createState() => _PaymentMethodsPageState();
}

class _PaymentMethodsPageState extends State<PaymentMethodsPage> {
  late final _controller = PaymentMethodsController(
    widget.repository ?? UserAppRepository(),
  );

  @override
  void initState() {
    super.initState();
    _controller.load();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _remove(Map<String, dynamic> method) async {
    final id = method['id'] as String;
    final confirmed = await showSolidActionSheet<bool>(
      context: context,
      title: 'Remove payment method?',
      actions: const [
        SolidSheetAction(
          value: true,
          label: 'Remove method',
          icon: Icons.delete_outline,
          destructive: true,
        ),
        SolidSheetAction(value: false, label: 'Keep method', icon: Icons.close),
      ],
    );
    if (confirmed != true || !mounted) return;
    final error = await _controller.remove(id);
    if (error != null && mounted) {
      showWalletError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'Payment methods',
    child: ListenableBuilder(
      listenable: _controller,
      builder: (context, _) {
        if (_controller.loading) return const SettingsListSkeleton(rows: 2);
        if (_controller.error case final error?) {
          return WalletErrorNotice(
            message: error,
            child: Center(
              child: SolidButton(text: 'Retry', onPressed: _controller.load),
            ),
          );
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            _MethodTile(
              icon: Icons.credit_card_outlined,
              title: 'Debit card',
              subtitle: 'Pay securely in Razorpay',
              onTap: () => showWalletAddMoney(context),
            ),
            const SizedBox(height: 10),
            _MethodTile(
              icon: Icons.qr_code_2_outlined,
              title: 'Add UPI ID',
              onTap: () => showWalletSheet(
                context,
                title: 'Add UPI ID',
                content: _UpiForm(controller: _controller),
              ),
            ),
            if (_controller.methods.isNotEmpty) ...[
              const SizedBox(height: 20),
              const Text(
                'Saved methods',
                style: TextStyle(fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 8),
              SolidSurface(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (final method in _controller.methods)
                      _MethodTile(
                        icon: method['type'] == 'CARD'
                            ? Icons.credit_card_outlined
                            : Icons.qr_code_2_outlined,
                        title: method['type'] == 'CARD'
                            ? '${method['card_brand'] ?? 'Card'} •••• ${method['card_last4'] ?? ''}'
                            : '${method['upi_handle'] ?? 'UPI'}',
                        trailing: IconButton(
                          tooltip: 'Remove method',
                          onPressed: _controller.saving
                              ? null
                              : () => _remove(method),
                          icon: const Icon(Icons.delete_outline),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ],
        );
      },
    ),
  );
}

class _UpiForm extends StatefulWidget {
  const _UpiForm({required this.controller});
  final PaymentMethodsController controller;

  @override
  State<_UpiForm> createState() => _UpiFormState();
}

class _UpiFormState extends State<_UpiForm> {
  final _id = TextEditingController();

  @override
  void dispose() {
    _id.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final error = await widget.controller.saveUpi(_id.text);
    if (!mounted) return;
    if (error == null) {
      Navigator.pop(context);
    } else {
      showWalletError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([_id, widget.controller]),
    builder: (context, _) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        SolidTextFormField(
          controller: _id,
          label: 'UPI ID',
          hint: 'name@bank',
          keyboardType: TextInputType.emailAddress,
          textCapitalization: TextCapitalization.none,
          enabled: !widget.controller.saving,
        ),
        SolidButton(
          text: 'Save UPI ID',
          busy: widget.controller.saving,
          onPressed: _id.text.trim().isEmpty ? null : _save,
        ),
      ],
    ),
  );
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    required this.icon,
    required this.title,
    this.subtitle,
    this.onTap,
    this.trailing,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => SolidSurface(
    padding: EdgeInsets.zero,
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      leading: CircleAvatar(
        radius: 19,
        backgroundColor: const Color(0xFFF2F5FC),
        foregroundColor: RideTokens.accent,
        child: Icon(icon, size: 19),
      ),
      title: Text(
        title,
        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      ),
      subtitle: subtitle == null
          ? null
          : Text(
              subtitle!,
              style: const TextStyle(fontSize: 12, color: RideTokens.muted),
            ),
      trailing: trailing ?? const Icon(Icons.chevron_right, size: 20),
      onTap: onTap,
    ),
  );
}
