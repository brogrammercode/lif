import 'dart:async';

import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/settings/widgets/settings_secondary.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SupportTicketPage extends StatefulWidget {
  final UserAppRepository? repository;
  final String? ticketId;
  const SupportTicketPage({super.key, this.repository, this.ticketId});

  @override
  State<SupportTicketPage> createState() => _SupportTicketPageState();
}

class _SupportTicketPageState extends State<SupportTicketPage> {
  late final UserAppRepository _repository =
      widget.repository ?? UserAppRepository();
  final TextEditingController _message = TextEditingController();
  final FocusNode _messageFocus = FocusNode();
  Map<String, dynamic>? _ticket;
  String? _myUserId;
  Object? _error;
  late String _ticketId;
  bool _initialized = false;
  bool _loading = true;
  bool _sending = false;
  int _generation = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _ticketId =
        widget.ticketId ??
        (ModalRoute.of(context)?.settings.arguments as String? ?? '');
    _initialized = true;
    unawaited(_loadProfile());
    _load();
  }

  Future<void> _loadProfile() async {
    try {
      final profile = await _repository.profile();
      if (mounted) setState(() => _myUserId = '${profile['id'] ?? ''}');
    } catch (_) {
      // Message ownership falls back to the first participant below.
    }
  }

  Future<void> _load({bool preserve = false}) async {
    final generation = ++_generation;
    if (_ticketId.isEmpty) {
      if (mounted) {
        setState(() {
          _error = StateError('This support request is unavailable.');
          _loading = false;
        });
      }
      return;
    }
    if (!preserve && mounted) setState(() => _loading = true);
    try {
      final value = await _repository.supportTicket(_ticketId);
      if (!mounted || generation != _generation) return;
      setState(() {
        _ticket = value;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      if (preserve && _ticket != null) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
        return;
      }
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _message.dispose();
    _messageFocus.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _message.text.trim();
    if (_sending || body.isEmpty || body.length > 5000) return;
    setState(() => _sending = true);
    try {
      await _repository.sendSupportMessage(_ticketId, body);
      _message.clear();
      _messageFocus.unfocus();
      await _load(preserve: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Reply sent to 1More Support.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: 'Support request',
    glass: true,
    scrollable: true,
    action: IconButton(
      tooltip: 'Refresh conversation',
      onPressed: _loading ? null : () => _load(preserve: true),
      icon: const Icon(Icons.refresh_rounded, color: GlassTokens.accent),
    ),
    child: _body(),
  );

  Widget _body() {
    if (_loading && _ticket == null) return const _ConversationSkeleton();
    if (_error != null && _ticket == null) {
      return AppLoadError(
        message: ApiResult.errorMessage(_error!),
        onRetry: _load,
      );
    }
    final ticket = _ticket!;
    final messages = (ticket['messages'] as List? ?? const [])
        .whereType<Map>()
        .map((value) => Map<String, dynamic>.from(value))
        .toList();
    final status = '${ticket['status'] ?? 'OPEN'}';
    final priority = '${ticket['priority'] ?? 'NORMAL'}';
    final reference = '${ticket['id'] ?? ''}';
    final shortReference = reference.length > 8
        ? reference.substring(reference.length - 8).toUpperCase()
        : reference.toUpperCase();
    final fallbackOwnId = messages.isEmpty ? null : messages.first['author_id'];
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
          child: LiquidGlassSurface(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${ticket['subject'] ?? 'Support request'}',
                  style: const TextStyle(
                    color: GlassTokens.ink,
                    fontSize: 18,
                    height: 1.3,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Request #$shortReference · Opened ${settingsDateTime(ticket['created_at'])}',
                  style: const TextStyle(
                    color: GlassTokens.muted,
                    fontSize: 11,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
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
                  ],
                ),
                if ({'RESOLVED', 'CLOSED'}.contains(status)) ...[
                  const SizedBox(height: 12),
                  Text(
                    'This request is ${readableEnum(status).toLowerCase()}. Sending a reply asks the team to review it again.',
                    style: const TextStyle(
                      color: GlassTokens.muted,
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _load(preserve: true),
            color: GlassTokens.accent,
            child: messages.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    children: const [
                      SizedBox(height: 28),
                      SettingsEmptyCard(
                        icon: Icons.forum_outlined,
                        title: 'Conversation is empty',
                        body: 'Write a reply below to contact 1More Support.',
                      ),
                    ],
                  )
                : ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 6, 20, 18),
                    itemCount: messages.length,
                    itemBuilder: (context, index) {
                      final message = messages[index];
                      final own =
                          message['author_id'] == (_myUserId ?? fallbackOwnId);
                      return _MessageBubble(message: message, own: own);
                    },
                  ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 10),
            child: LiquidGlassSurface(
              radius: 22,
              padding: const EdgeInsets.fromLTRB(14, 5, 6, 5),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _message,
                      focusNode: _messageFocus,
                      enabled: !_sending,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 5000,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        hintText: 'Write a reply…',
                        filled: false,
                        counterText: '',
                        contentPadding: EdgeInsets.symmetric(vertical: 14),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  IconButton(
                    tooltip: _sending ? 'Sending reply' : 'Send reply',
                    onPressed: _sending ? null : _send,
                    icon: Icon(
                      _sending ? Icons.hourglass_top : Icons.send_rounded,
                      color: _sending ? GlassTokens.muted : GlassTokens.accent,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
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

class _MessageBubble extends StatelessWidget {
  final Map<String, dynamic> message;
  final bool own;
  const _MessageBubble({required this.message, required this.own});

  @override
  Widget build(BuildContext context) => Align(
    alignment: own ? Alignment.centerRight : Alignment.centerLeft,
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * .78,
      ),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: LiquidGlassSurface(
          dark: own,
          tint: own ? null : const Color(0xFFE8DEFF),
          radius: 21,
          padding: const EdgeInsets.fromLTRB(15, 12, 15, 11),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                own ? 'You' : '1More Support',
                style: TextStyle(
                  color: own ? Colors.white70 : GlassTokens.accent,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                '${message['body'] ?? ''}',
                style: TextStyle(
                  color: own ? Colors.white : GlassTokens.ink,
                  fontSize: 13,
                  height: 1.42,
                ),
              ),
              const SizedBox(height: 7),
              Text(
                settingsDateTime(message['created_at']),
                style: TextStyle(
                  color: own ? Colors.white60 : GlassTokens.muted,
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _ConversationSkeleton extends StatelessWidget {
  const _ConversationSkeleton();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
    child: AppSkeleton(
      label: 'Loading support conversation',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LiquidGlassSurface(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                SkeletonBox(width: 190, height: 19),
                SizedBox(height: 10),
                SkeletonBox(width: 145, height: 11),
                SizedBox(height: 14),
                SkeletonBox(width: 96, height: 24),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Align(
            alignment: Alignment.centerRight,
            child: SkeletonBox(width: 230, height: 88),
          ),
          const SizedBox(height: 14),
          const Align(
            alignment: Alignment.centerLeft,
            child: SkeletonBox(width: 250, height: 108),
          ),
        ],
      ),
    ),
  );
}
