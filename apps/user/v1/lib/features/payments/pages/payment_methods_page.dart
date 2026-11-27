import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/payments/controllers/payment_methods_controller.dart';
import 'package:user/features/settings/widgets/settings_secondary.dart';
import 'package:user/features/settings/widgets/wallet_checkout_form.dart';
import 'package:user/features/settings/widgets/wallet_sheet.dart';
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove payment method?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final error = await _controller.remove(id);
    if (error != null && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error)));
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
          return AppLoadError(message: error, onRetry: _controller.load);
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            SolidSurface(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.credit_card_outlined),
                    title: const Text('Debit card'),
                    subtitle: const Text(
                      'Enter card details in Razorpay checkout',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showWalletSheet(
                      context,
                      title: 'Add money by card',
                      content: const StandaloneWalletCheckoutForm(),
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.qr_code_2_outlined),
                    title: const Text('Add UPI ID'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showWalletSheet(
                      context,
                      title: 'Add UPI ID',
                      content: _UpiForm(controller: _controller),
                    ),
                  ),
                ],
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
                      ListTile(
                        leading: Icon(
                          method['type'] == 'CARD'
                              ? Icons.credit_card_outlined
                              : Icons.qr_code_2_outlined,
                        ),
                        title: Text(
                          method['type'] == 'CARD'
                              ? '${method['card_brand'] ?? 'Card'} •••• ${method['card_last4'] ?? ''}'
                              : '${method['upi_handle'] ?? 'UPI'}',
                        ),
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
  String? _error;

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
      setState(() => _error = error);
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
        if (_error case final error?)
          Text(
            error,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
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
