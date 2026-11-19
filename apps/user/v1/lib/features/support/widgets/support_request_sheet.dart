import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart'
    show RideArrivalStrip, RideStagePanel;
import 'package:user/features/support/controllers/support_request_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Shared complaint/support request form used by all support entry points.
/// Returns the created ticket when submission succeeds.
class SupportRequestSheet extends StatefulWidget {
  final UserAppRepository repository;
  final String initialDetails;

  const SupportRequestSheet({
    super.key,
    required this.repository,
    this.initialDetails = '',
  });

  @override
  State<SupportRequestSheet> createState() => _SupportRequestSheetState();
}

class _SupportRequestSheetState extends State<SupportRequestSheet> {
  late final _controller = SupportRequestController()..addListener(_changed);
  final _form = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _details = TextEditingController();

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _details.text = widget.initialDetails;
  }

  @override
  void dispose() {
    _controller.removeListener(_changed);
    _controller.dispose();
    _subject.dispose();
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_controller.sending || !(_form.currentState?.validate() ?? false)) {
      return;
    }
    setState(() {
      _controller.sending = true;
      _controller.error = null;
    });
    try {
      final ticket = await widget.repository.createSupportTicket({
        'subject': _subject.text.trim(),
        'body': _details.text.trim(),
        'priority': _controller.priority,
      }, requestKey: _controller.requestKey);
      if (mounted) Navigator.pop(context, ticket);
    } catch (error) {
      if (mounted) {
        setState(() {
          _controller.sending = false;
          _controller.error = ApiResult.errorMessage(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      // The panel adds 54 px for its header and 20 px for outer margins.
      // Reserve the bottom safe-area inset once along with those dimensions.
      final bottomSafeInset = MediaQuery.paddingOf(context).bottom;
      final availableHeight = constraints.maxHeight.isFinite
          ? constraints.maxHeight
          : MediaQuery.sizeOf(context).height * .84;
      final height = (availableHeight - 74 - bottomSafeInset)
          .clamp(0.0, 650.0)
          .toDouble();
      return PopScope(
        canPop: !_controller.sending,
        child: RideStagePanel(
          header: const RideArrivalStrip(
            label: 'Report a complaint',
            value: 'New',
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
                            'A support agent will review your request and reply here.',
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
                                    controller: _subject,
                                    enabled: !_controller.sending,
                                    label: 'Subject',
                                    hint: 'What is the complaint about?',
                                    maxLength: 160,
                                    validator: (value) =>
                                        (value?.trim().isEmpty ?? true)
                                        ? 'Enter a subject'
                                        : null,
                                  ),
                                  const SizedBox(height: 14),
                                  SolidDropdownFormField<String>(
                                    initialValue: _controller.priority,
                                    label: 'Priority',
                                    items: const [
                                      DropdownMenuItem(
                                        value: 'LOW',
                                        child: Text('Low'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'NORMAL',
                                        child: Text('Normal'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'HIGH',
                                        child: Text('High'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'URGENT',
                                        child: Text('Urgent'),
                                      ),
                                    ],
                                    onChanged: _controller.sending
                                        ? null
                                        : (value) {
                                            if (value != null) {
                                              setState(
                                                () => _controller.priority =
                                                    value,
                                              );
                                            }
                                          },
                                  ),
                                  const SizedBox(height: 14),
                                  SolidTextFormField(
                                    controller: _details,
                                    enabled: !_controller.sending,
                                    label: 'Details',
                                    hint:
                                        'Include what happened and any ride reference.',
                                    minLines: 4,
                                    maxLines: 7,
                                    maxLength: 5000,
                                    alignLabelWithHint: true,
                                    validator: (value) =>
                                        (value?.trim().isEmpty ?? true)
                                        ? 'Add the complaint details'
                                        : null,
                                  ),
                                  if (_controller.error != null) ...[
                                    const SizedBox(height: 10),
                                    Text(
                                      _controller.error!,
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
                              text: _controller.sending
                                  ? 'Sending...'
                                  : 'Send complaint',
                              onPressed: _controller.sending ? null : _submit,
                              busy: _controller.sending,
                              icon: const Icon(Icons.send_rounded, size: 17),
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
