import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart'
    show RideArrivalStrip, RideStagePanel;

class EmergencyContactSheet extends StatefulWidget {
  final Map<String, dynamic>? contact;
  final Future<void> Function(Map<String, dynamic> value) onSubmit;

  const EmergencyContactSheet({
    super.key,
    this.contact,
    required this.onSubmit,
  });

  @override
  State<EmergencyContactSheet> createState() => _EmergencyContactSheetState();
}

class _EmergencyContactSheetState extends State<EmergencyContactSheet> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(
    text: '${widget.contact?['name'] ?? ''}',
  );
  late final _phone = TextEditingController(
    text: '${widget.contact?['phone_e164'] ?? ''}',
  );
  late final _relationship = TextEditingController(
    text: '${widget.contact?['relationship'] ?? ''}',
  );
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _relationship.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_saving || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.onSubmit({
        'name': _name.text.trim(),
        'phone_e164': _phone.text.replaceAll(RegExp(r'\s+'), ''),
        'relationship': _relationship.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = ApiResult.errorMessage(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final bottomSafeInset = MediaQuery.paddingOf(context).bottom;
      final availableHeight = constraints.maxHeight.isFinite
          ? constraints.maxHeight
          : MediaQuery.sizeOf(context).height * .84;
      final height = (availableHeight - 74 - bottomSafeInset)
          .clamp(0.0, 650.0)
          .toDouble();
      final isEditing = widget.contact != null;
      return PopScope(
        canPop: !_saving,
        child: RideStagePanel(
          header: RideArrivalStrip(
            label: isEditing
                ? 'Edit emergency contact'
                : 'Add emergency contact',
            value: isEditing ? 'Edit' : 'New',
          ),
          child: SafeArea(
            top: false,
            child: SizedBox(
              height: height,
              child: Column(
                children: [
                  Container(
                    width: 36,
                    height: 3,
                    margin: const EdgeInsets.symmetric(vertical: 9),
                    decoration: BoxDecoration(
                      color: const Color(0xFFCCCCCC),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(18, 5, 18, 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'Add someone you trust for quick access from ride safety tools.',
                            style: TextStyle(
                              color: RideTokens.muted,
                              fontSize: 13,
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Expanded(
                            child: Form(
                              key: _form,
                              child: ListView(
                                padding: EdgeInsets.zero,
                                children: [
                                  SolidTextFormField(
                                    controller: _name,
                                    enabled: !_saving,
                                    label: 'Full name',
                                    hint: 'Contact name',
                                    textCapitalization:
                                        TextCapitalization.words,
                                    textInputAction: TextInputAction.next,
                                    maxLength: 100,
                                    validator: (value) =>
                                        (value?.trim().isEmpty ?? true)
                                        ? 'Enter the contact name'
                                        : null,
                                  ),
                                  const SizedBox(height: 14),
                                  SolidTextFormField(
                                    controller: _phone,
                                    enabled: !_saving,
                                    label: 'Phone with country code',
                                    hint: '+91 98765 43210',
                                    keyboardType: TextInputType.phone,
                                    textInputAction: TextInputAction.next,
                                    inputFormatters: [
                                      FilteringTextInputFormatter.allow(
                                        RegExp(r'[+0-9 ]'),
                                      ),
                                      LengthLimitingTextInputFormatter(18),
                                    ],
                                    validator: (value) {
                                      final compact = (value ?? '').replaceAll(
                                        RegExp(r'\s+'),
                                        '',
                                      );
                                      return RegExp(
                                            r'^\+[1-9]\d{7,14}$',
                                          ).hasMatch(compact)
                                          ? null
                                          : 'Use + followed by 8 to 15 digits';
                                    },
                                  ),
                                  const SizedBox(height: 14),
                                  SolidTextFormField(
                                    controller: _relationship,
                                    enabled: !_saving,
                                    label: 'Relationship (optional)',
                                    hint: 'Parent, sibling, friend',
                                    textCapitalization:
                                        TextCapitalization.words,
                                    textInputAction: TextInputAction.done,
                                    maxLength: 80,
                                    onFieldSubmitted: (_) => _submit(),
                                  ),
                                  if (_error != null) ...[
                                    const SizedBox(height: 10),
                                    Text(
                                      _error!,
                                      style: const TextStyle(
                                        color: Color(0xFFB3261E),
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          SizedBox(
                            height: 56,
                            child: SolidButton(
                              text: _saving
                                  ? (isEditing ? 'Saving...' : 'Adding...')
                                  : (isEditing
                                        ? 'Save changes'
                                        : 'Add contact'),
                              onPressed: _saving ? null : _submit,
                              busy: _saving,
                              icon: Icon(
                                isEditing
                                    ? Icons.check_rounded
                                    : Icons.person_add_alt_1_outlined,
                                size: 18,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}
