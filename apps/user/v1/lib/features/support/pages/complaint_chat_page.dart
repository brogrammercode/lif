import 'dart:async';

import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/support/controllers/complaint_assistant_controller.dart';
import 'package:user/features/support/pages/support_ticket_page.dart';
import 'package:user/features/support/widgets/support_request_sheet.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class ComplaintChatPage extends StatefulWidget {
  final UserAppRepository? repository;
  const ComplaintChatPage({super.key, this.repository});

  @override
  State<ComplaintChatPage> createState() => _ComplaintChatPageState();
}

class _ComplaintChatPageState extends State<ComplaintChatPage> {
  late final _repository = widget.repository ?? UserAppRepository();
  late final _controller = ComplaintAssistantController()
    ..addListener(_changed);
  final _message = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();

  void _changed() {
    if (!mounted) return;
    setState(() {});
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _controller.removeListener(_changed);
    _controller.dispose();
    _message.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send() {
    final text = _message.text;
    if (text.trim().isEmpty || _controller.replying) return;
    _controller.send(text);
    _message.clear();
    _focus.unfocus();
  }

  Future<void> _talkToAgent() async {
    final ticket = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SupportRequestSheet(
        repository: _repository,
        initialDetails: _controller.latestUserMessage ?? '',
      ),
    );
    if (!mounted || ticket == null) return;
    final id = '${ticket['id'] ?? ''}';
    if (id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'The request was created but could not be opened. Find it in Help Me.',
          ),
        ),
      );
      return;
    }
    await Navigator.pushReplacement<void, void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) =>
            SupportTicketPage(repository: _repository, ticketId: id),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'Report a complaint',
    child: Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 8),
          child: Row(
            children: [
              const CircleAvatar(
                radius: 19,
                backgroundColor: Color(0xFFF2F3F5),
                child: Icon(Icons.support_agent_rounded, size: 21),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '1More Assistant',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    SizedBox(height: 2),
                    Row(
                      children: [
                        Icon(Icons.circle, size: 7, color: Color(0xFF35A66B)),
                        SizedBox(width: 5),
                        Text(
                          'Quick help',
                          style: TextStyle(
                            fontSize: 12,
                            color: RideTokens.muted,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Talk to a support agent',
                onPressed: _talkToAgent,
                icon: const Icon(Icons.support_agent_rounded),
              ),
            ],
          ),
        ),
        const Divider(height: 1, color: RideTokens.line),
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text(
            'Today',
            style: TextStyle(color: RideTokens.muted, fontSize: 11),
          ),
        ),
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
            itemCount:
                _controller.messages.length + (_controller.replying ? 1 : 0),
            itemBuilder: (context, index) {
              if (index == _controller.messages.length) {
                return const _TypingIndicator();
              }
              return _ChatBubble(message: _controller.messages[index]);
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 5, 16, 6),
          child: Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _talkToAgent,
              icon: const Icon(Icons.support_agent_rounded, size: 18),
              label: const Text('Talk to a support agent'),
              style: TextButton.styleFrom(
                foregroundColor: RideTokens.accent,
                textStyle: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 5, 14, 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: _message,
                    focusNode: _focus,
                    enabled: !_controller.replying,
                    minLines: 1,
                    maxLines: 4,
                    maxLength: 5000,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(
                      hintText: 'Message 1More Assistant…',
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
                    onSubmitted: (_) => _send(),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 48,
                  height: 48,
                  child: FilledButton(
                    onPressed: _controller.replying ? null : _send,
                    style: FilledButton.styleFrom(
                      backgroundColor: RideTokens.accent,
                      foregroundColor: Colors.white,
                      padding: EdgeInsets.zero,
                      shape: const CircleBorder(),
                    ),
                    child: _controller.replying
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
    ),
  );
}

class _ChatBubble extends StatelessWidget {
  final ComplaintChatMessage message;
  const _ChatBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.fromUser;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: isUser
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isUser) ...[
            const CircleAvatar(
              radius: 11,
              backgroundColor: Color(0xFFF0F1F3),
              child: Icon(Icons.support_agent_rounded, size: 14),
            ),
            const SizedBox(width: 7),
          ],
          Flexible(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.sizeOf(context).width * .78,
              ),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: isUser
                      ? const Color(0xFF1688F8)
                      : const Color(0xFFF3F3F3),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(13, 10, 13, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (!isUser) ...[
                        const Text(
                          '1More Assistant',
                          style: TextStyle(
                            color: RideTokens.muted,
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 4),
                      ],
                      Text(
                        message.text,
                        style: TextStyle(
                          color: isUser ? Colors.white : RideTokens.ink,
                          fontSize: 14,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                          MaterialLocalizations.of(context).formatTimeOfDay(
                            TimeOfDay.fromDateTime(message.createdAt),
                          ),
                          style: TextStyle(
                            color: isUser ? Colors.white70 : RideTokens.muted,
                            fontSize: 10,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TypingIndicator extends StatelessWidget {
  const _TypingIndicator();

  @override
  Widget build(BuildContext context) => const Align(
    alignment: Alignment.centerLeft,
    child: Padding(
      padding: EdgeInsets.only(left: 30, bottom: 12),
      child: Text(
        '1More Assistant is typing…',
        style: TextStyle(color: RideTokens.muted, fontSize: 12),
      ),
    ),
  );
}
