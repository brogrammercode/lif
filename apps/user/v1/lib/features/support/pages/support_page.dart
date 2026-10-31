import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/glass_dropdown.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/settings/widgets/settings_secondary.dart';
import 'package:user/features/support/widgets/support_contact_card.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SupportPage extends StatefulWidget {
  final UserAppRepository? repository;
  const SupportPage({super.key, this.repository});

  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  late final UserAppRepository _repository =
      widget.repository ?? UserAppRepository();
  List<Map<String, dynamic>> _tickets = const [];
  Object? _error;
  bool _loading = true;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool preserve = false}) async {
    final generation = ++_generation;
    if (!preserve && mounted) setState(() => _loading = true);
    try {
      final value = await _repository.supportTickets();
      if (!mounted || generation != _generation) return;
      setState(() {
        _tickets = value;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      if (preserve && _tickets.isNotEmpty) {
        _showError(error);
        return;
      }
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _newRequest() async {
    final created = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _SupportRequestDialog(repository: _repository),
    );
    if (created == true && mounted) {
      await _load(preserve: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Support request created. Replies will appear here.'),
          ),
        );
      }
    }
  }

  void _showError(Object error) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.SUPPORT,
    glass: true,
    scrollable: true,
    action: IconButton(
      tooltip: 'New support request',
      onPressed: _newRequest,
      icon: const Icon(Icons.add_comment_outlined, color: GlassTokens.accent),
    ),
    child: _body(),
  );

  Widget _body() {
    if (_loading && _tickets.isEmpty) {
      return const SettingsListSkeleton(rows: 3);
    }
    if (_error != null && _tickets.isEmpty) {
      return AppLoadError(
        message: ApiResult.errorMessage(_error!),
        onRetry: _load,
      );
    }
    final active = _tickets
        .where((ticket) => !{'RESOLVED', 'CLOSED'}.contains(ticket['status']))
        .length;
    return RefreshIndicator(
      onRefresh: () => _load(preserve: true),
      color: GlassTokens.accent,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 30),
        children: [
          SettingsIntroCard(
            icon: Icons.support_agent_outlined,
            title: 'How can we help?',
            body:
                'Call a configured support channel for immediate help, or create a request to keep the full conversation in one place.',
            footer: SizedBox(
              width: double.infinity,
              child: LiquidGlassButton(
                text: 'Create support request',
                icon: const Icon(Icons.add_comment_outlined),
                onPressed: _newRequest,
              ),
            ),
          ),
          const SizedBox(height: 14),
          SupportContactCard(repository: _repository),
          const SizedBox(height: 24),
          SettingsSectionHeader(
            title: 'Your requests',
            helper: _tickets.isEmpty
                ? 'Requests and replies will appear here.'
                : '$active active · ${_tickets.length} total',
            trailing: IconButton(
              tooltip: 'Refresh requests',
              onPressed: () => _load(preserve: true),
              icon: const Icon(
                Icons.refresh_rounded,
                color: GlassTokens.accent,
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (_tickets.isEmpty)
            SettingsEmptyCard(
              icon: Icons.forum_outlined,
              title: UserAppCopy.EMPTY_SUPPORT,
              body: UserAppCopy.EMPTY_SUPPORT_DESCRIPTION,
              action: OutlinedButton.icon(
                onPressed: _newRequest,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('New request'),
              ),
            )
          else
            for (var index = 0; index < _tickets.length; index++) ...[
              _ticket(_tickets[index]),
              if (index != _tickets.length - 1) const SizedBox(height: 12),
            ],
        ],
      ),
    );
  }

  Widget _ticket(Map<String, dynamic> ticket) {
    final status = '${ticket['status'] ?? 'OPEN'}';
    final priority = '${ticket['priority'] ?? 'NORMAL'}';
    final messages = (ticket['messages'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final lastMessage = messages.isEmpty ? null : messages.last;
    final reference = '${ticket['id'] ?? ''}';
    final shortReference = reference.length > 8
        ? reference.substring(reference.length - 8).toUpperCase()
        : reference.toUpperCase();
    return LiquidGlassSurface(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: () => Navigator.pushNamed(
          context,
          AppRoutes.supportTicket,
          arguments: ticket['id'],
        ).then((_) => _load(preserve: true)),
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.all(17),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  LiquidGlassSurface(
                    radius: 99,
                    padding: const EdgeInsets.all(11),
                    child: Icon(
                      _statusIcon(status),
                      size: 21,
                      color: _statusColor(status),
                    ),
                  ),
                  const SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${ticket['subject'] ?? 'Support request'}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: GlassTokens.ink,
                            fontSize: 15,
                            height: 1.3,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Request #$shortReference · ${messages.length} ${messages.length == 1 ? 'message' : 'messages'}',
                          style: const TextStyle(
                            color: GlassTokens.muted,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.chevron_right, color: GlassTokens.muted),
                ],
              ),
              if (lastMessage != null) ...[
                const SizedBox(height: 13),
                Text(
                  '${lastMessage['body'] ?? ''}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: GlassTokens.muted,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
              ],
              const SizedBox(height: 13),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SettingsStatusPill(
                    label: readableEnum(status),
                    color: _statusColor(status),
                    icon: _statusIcon(status),
                  ),
                  SettingsStatusPill(
                    label: '${readableEnum(priority)} priority',
                    color: _priorityColor(priority),
                  ),
                  Text(
                    settingsDateTime(
                      ticket['updated_at'] ?? ticket['created_at'],
                    ),
                    style: const TextStyle(
                      color: GlassTokens.muted,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _statusIcon(String status) => switch (status) {
    'RESOLVED' => Icons.check_circle_outline,
    'CLOSED' => Icons.lock_outline,
    'WAITING_FOR_USER' => Icons.mark_chat_unread_outlined,
    'IN_PROGRESS' => Icons.pending_actions_outlined,
    _ => Icons.chat_bubble_outline,
  };

  Color _statusColor(String status) => switch (status) {
    'RESOLVED' => const Color(0xFF397864),
    'CLOSED' => GlassTokens.muted,
    'WAITING_FOR_USER' => const Color(0xFFA66C28),
    'IN_PROGRESS' => const Color(0xFF785B9B),
    _ => GlassTokens.accent,
  };

  Color _priorityColor(String priority) => switch (priority) {
    'URGENT' => AppColors.googleRed,
    'HIGH' => const Color(0xFFA66C28),
    'LOW' => GlassTokens.muted,
    _ => GlassTokens.accent,
  };
}

class _SupportRequestDialog extends StatefulWidget {
  final UserAppRepository repository;
  const _SupportRequestDialog({required this.repository});

  @override
  State<_SupportRequestDialog> createState() => _SupportRequestDialogState();
}

class _SupportRequestDialogState extends State<_SupportRequestDialog> {
  final _form = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _message = TextEditingController();
  final String _requestKey =
      'support-mobile-${DateTime.now().microsecondsSinceEpoch}';
  String _priority = 'NORMAL';
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_sending || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await widget.repository.createSupportTicket({
        'subject': _subject.text.trim(),
        'body': _message.text.trim(),
        'priority': _priority,
      }, requestKey: _requestKey);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = ApiResult.errorMessage(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_sending,
    child: LiquidGlassDialog(
      title: const Text('New support request'),
      content: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Describe one issue per request. Include the ride reference in your message when it concerns a trip.',
              style: TextStyle(color: GlassTokens.muted, height: 1.45),
            ),
            const SizedBox(height: 18),
            TextFormField(
              controller: _subject,
              enabled: !_sending,
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.next,
              maxLength: 160,
              decoration: const InputDecoration(
                labelText: 'Subject',
                hintText: 'What do you need help with?',
                prefixIcon: Icon(Icons.subject_outlined),
                counterText: '',
              ),
              validator: (value) =>
                  (value?.trim().isEmpty ?? true) ? 'Enter a subject' : null,
            ),
            const SizedBox(height: 18),
            LiquidGlassDropdownFormField<String>(
              initialValue: _priority,
              items: const [
                DropdownMenuItem(value: 'LOW', child: Text('Low')),
                DropdownMenuItem(value: 'NORMAL', child: Text('Normal')),
                DropdownMenuItem(value: 'HIGH', child: Text('High')),
                DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
              ],
              onChanged: _sending
                  ? null
                  : (value) {
                      if (value != null) setState(() => _priority = value);
                    },
              decoration: const InputDecoration(
                labelText: 'Priority',
                prefixIcon: Icon(Icons.flag_outlined),
              ),
            ),
            const SizedBox(height: 18),
            TextFormField(
              controller: _message,
              enabled: !_sending,
              minLines: 4,
              maxLines: 7,
              maxLength: 5000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Message',
                hintText: 'Tell us what happened and what you need.',
                alignLabelWithHint: true,
              ),
              validator: (value) =>
                  (value?.trim().isEmpty ?? true) ? 'Enter a message' : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(
                  color: AppColors.googleRed,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _sending ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton.icon(
          onPressed: _sending ? null : _submit,
          icon: Icon(_sending ? Icons.hourglass_top : Icons.send_outlined),
          label: Text(_sending ? 'Sending…' : 'Send request'),
        ),
      ],
    ),
  );
}
