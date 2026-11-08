import 'package:user/features/driver_operations/controllers/trip_chat_controller.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';

class TripChatPage extends StatefulWidget {
  const TripChatPage({super.key});

  @override
  State<TripChatPage> createState() => _TripChatPageState();
}

class _TripChatPageState extends State<TripChatPage> {
  TripChatController? _controller;
  final _text = TextEditingController();
  Timer? _poll;
  String? get _userId => _controller?.userId;
  String? get _error => _controller?.error;
  List<Map<String, dynamic>> get _messages => _controller?.messages ?? [];
  bool get _loading => _controller?.loading ?? true;
  bool get _sending => _controller?.sending ?? false;
  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final source = DataSourceScope.of(context);
    _controller = TripChatController(
      repository: DriverOperationsRepository(client: source?.client),
      id: ModalRoute.of(context)?.settings.arguments as String? ?? '',
      userId: source?.userId,
    )..addListener(_changed);
    unawaited(_load());
    _poll = Timer.periodic(const Duration(seconds: 4), (_) {
      if (ModalRoute.of(context)?.isCurrent == true &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        unawaited(_load());
      }
    });
  }

  Future<void> _load() => _controller!.load();

  Future<void> _send() async {
    final text = _text.text;
    try {
      if (await _controller!.send(text) && mounted && _text.text == text) {
        _text.clear();
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
    _controller?.removeListener(_changed);
    _controller?.dispose();
    _poll?.cancel();
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'Trip chat',
    child: Column(
      children: [
        const DriverNotice(
          icon: Icons.lock_outline_rounded,
          message:
              'Messages stay between you and the other person on this trip. The latest 100 are shown.',
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: DriverNotice(
              icon: Icons.sync_problem_rounded,
              message: _error!,
              error: true,
              actionLabel: 'Retry',
              onAction: _load,
            ),
          ),
        const SizedBox(height: 10),
        Expanded(
          child: _loading
              ? const DriverListSkeleton(rows: 5)
              : _messages.isEmpty
              ? const AppEmptyState(
                  icon: Icons.forum_outlined,
                  title: 'No messages yet',
                  subtitle: 'Use chat for clear trip coordination.',
                )
              : ListView.builder(
                  reverse: true,
                  itemCount: _messages.length,
                  itemBuilder: (context, index) {
                    final message = _messages[_messages.length - 1 - index];
                    final own = message['sender_id'] == _userId;
                    return Align(
                      alignment: own
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.sizeOf(context).width * .76,
                        ),
                        child: SolidSurface(
                          margin: const EdgeInsets.symmetric(vertical: 4),
                          padding: const EdgeInsets.all(12),
                          dark: own,
                          child: Text(
                            '${message['body']}',
                            style: TextStyle(
                              color: own ? Colors.white : RideTokens.ink,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
        SolidSurface(
          padding: const EdgeInsets.fromLTRB(8, 4, 6, 4),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _text,
                  maxLength: 1000,
                  minLines: 1,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    hintText: 'Message',
                    counterText: '',
                  ),
                ),
              ),
              SolidIconButton(
                onPressed: _sending ? null : _send,
                tooltip: _sending ? 'Sending message' : 'Send message',
                icon: _sending ? Icons.more_horiz_rounded : Icons.send_rounded,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
      ],
    ),
  );
}
