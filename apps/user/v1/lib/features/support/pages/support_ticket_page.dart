import 'dart:async';

import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/settings/widgets/settings_secondary.dart';
import 'package:user/features/support/controllers/support_ticket_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SupportTicketPage extends StatefulWidget {
  final UserAppRepository? repository;
  final String? ticketId;
  const SupportTicketPage({super.key, this.repository, this.ticketId});

  @override
  State<SupportTicketPage> createState() => _SupportTicketPageState();
}

class _SupportTicketPageState extends State<SupportTicketPage> {
  late final _controller = SupportTicketController(
    widget.repository ?? UserAppRepository(),
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  UserAppRepository get _repository => _controller.repository;
  final TextEditingController _message = TextEditingController();
  final FocusNode _messageFocus = FocusNode();
  Map<String, dynamic>? get _ticket => _controller.ticket;
  String? get _myUserId => _controller.myUserId;
  Object? get _error => _controller.error;
  String get _ticketId => _controller.ticketId;
  set _ticketId(String value) => _controller.ticketId = value;
  bool _initialized = false;
  bool get _loading => _controller.loading;
  bool get _sending => _controller.sending;
  set _sending(bool value) => _controller.sending = value;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _ticketId =
        widget.ticketId ??
        (ModalRoute.of(context)?.settings.arguments as String? ?? '');
    _initialized = true;
    unawaited(_controller.loadProfile());
    unawaited(_load());
  }

  Future<void> _load({bool preserve = false}) async {
    await _controller.load(preserve: preserve);
    final notice = _controller.notice;
    _controller.notice = null;
    if (mounted && notice != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(notice)));
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
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
  Widget build(BuildContext context) => SolidPage(
    title: '${_ticket?['subject'] ?? 'Support conversation'}',
    action: IconButton(
      tooltip: 'Refresh conversation',
      onPressed: _loading ? null : () => _load(preserve: true),
      icon: const Icon(Icons.refresh_rounded, color: Colors.white),
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
    final fallbackOwnId = messages.isEmpty ? null : messages.first['author_id'];
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 7),
          child: Row(
            children: [
              const Icon(
                Icons.support_agent_rounded,
                size: 17,
                color: RideTokens.muted,
              ),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  {'RESOLVED', 'CLOSED'}.contains(status)
                      ? '1More Support · ${readableEnum(status)}'
                      : '1More Support',
                  style: const TextStyle(fontSize: 12, color: RideTokens.muted),
                ),
              ),
              Text(
                settingsDateTime(ticket['created_at']),
                style: const TextStyle(fontSize: 11, color: RideTokens.muted),
              ),
            ],
          ),
        ),
        const Padding(
          padding: EdgeInsets.only(bottom: 8),
          child: Text(
            'Today',
            style: TextStyle(fontSize: 11, color: RideTokens.muted),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _load(preserve: true),
            color: RideTokens.accent,
            child: messages.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: const [
                      SizedBox(height: 30),
                      Text(
                        'Your support conversation will appear here.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: RideTokens.muted),
                      ),
                    ],
                  )
                : ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    itemCount: messages.length,
                    itemBuilder: (context, index) {
                      final message = messages[index];
                      final own =
                          message['author_id'] == (_myUserId ?? fallbackOwnId);
                      return _SupportMessageBubble(message: message, own: own);
                    },
                  ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
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
                    decoration: InputDecoration(
                      hintText: 'Write a message…',
                      counterText: '',
                      filled: true,
                      fillColor: const Color(0xFFF5F5F5),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    onChanged: (_) => setState(() {}),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                const SizedBox(width: 8),
                if (_message.text.trim().isNotEmpty)
                  SizedBox(
                    width: 48,
                    height: 48,
                    child: FilledButton(
                      onPressed: _sending ? null : _send,
                      style: FilledButton.styleFrom(
                        backgroundColor: RideTokens.accent,
                        foregroundColor: Colors.white,
                        padding: EdgeInsets.zero,
                        shape: const CircleBorder(),
                      ),
                      child: _sending
                          ? const SizedBox.square(
                              dimension: 19,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.send_rounded, size: 20),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _SupportMessageBubble extends StatelessWidget {
  final Map<String, dynamic> message;
  final bool own;
  const _SupportMessageBubble({required this.message, required this.own});

  @override
  Widget build(BuildContext context) => Align(
    alignment: own ? Alignment.centerRight : Alignment.centerLeft,
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * .78,
      ),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          mainAxisAlignment: own
              ? MainAxisAlignment.end
              : MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (!own) ...[
              const CircleAvatar(
                radius: 11,
                backgroundColor: Color(0xFFF0F1F3),
                child: Icon(Icons.support_agent_rounded, size: 14),
              ),
              const SizedBox(width: 7),
            ],
            Flexible(
              child: Container(
                padding: const EdgeInsets.fromLTRB(13, 10, 13, 8),
                decoration: BoxDecoration(
                  color: own
                      ? const Color(0xFF1688F8)
                      : const Color(0xFFF3F3F3),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      own ? 'You' : '1More Support',
                      style: TextStyle(
                        color: own ? Colors.white70 : RideTokens.muted,
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${message['body'] ?? ''}',
                      style: TextStyle(
                        color: own ? Colors.white : RideTokens.ink,
                        fontSize: 14,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        settingsDateTime(message['created_at']),
                        style: TextStyle(
                          color: own ? Colors.white70 : RideTokens.muted,
                          fontSize: 10,
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
  );
}

class _ConversationSkeleton extends StatelessWidget {
  const _ConversationSkeleton();

  @override
  Widget build(BuildContext context) => AppSkeleton(
    label: 'Loading support conversation',
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        children: [
          const SkeletonBox(width: 140, height: 15),
          const SizedBox(height: 24),
          const Align(
            alignment: Alignment.centerLeft,
            child: SkeletonBox(width: 230, height: 76),
          ),
          const SizedBox(height: 14),
          const Align(
            alignment: Alignment.centerRight,
            child: SkeletonBox(width: 220, height: 66),
          ),
        ],
      ),
    ),
  );
}
