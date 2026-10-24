import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';

class TripChatPage extends StatefulWidget {
  const TripChatPage({super.key});
  @override
  State<TripChatPage> createState() => _TripChatPageState();
}

class _TripChatPageState extends State<TripChatPage> {
  final _repo = DriverOperationsRepository();
  final _text = TextEditingController();
  String? _id, _userId, _error, _pendingText, _pendingKey;
  List<Map<String, dynamic>> _messages = [];
  Timer? _poll;
  bool _loading = true, _sending = false, _refreshing = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_id != null) return;
    _id = ModalRoute.of(context)?.settings.arguments as String? ?? '';
    unawaited(_load());
    _poll = Timer.periodic(const Duration(seconds: 4), (_) {
      if (ModalRoute.of(context)?.isCurrent == true &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        unawaited(_load());
      }
    });
  }

  Future<void> _load() async {
    if (_refreshing || !mounted) return;
    _refreshing = true;
    try {
      _userId ??= (await AuthRepository().currentUser()).id;
      final messages = await _repo.messages(_id!);
      if (mounted) {
        setState(() {
          _messages = messages;
          _error = null;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = ApiResult.errorMessage(e);
          _loading = false;
        });
      }
    } finally {
      _refreshing = false;
    }
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (_sending || body.isEmpty) return;
    if (_pendingText != body) {
      _pendingText = body;
      _pendingKey = List.generate(
        16,
        (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join();
    }
    setState(() => _sending = true);
    try {
      await _repo.sendMessage(_id!, body, _pendingKey!);
      if (!mounted) return;
      if (_text.text.trim() == body) _text.clear();
      _pendingText = null;
      _pendingKey = null;
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(e))));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: 'Trip chat',
    child: Column(
      children: [
        const Text(
          'Messages are shared only with the other person on this trip. The latest 100 messages are shown.',
        ),
        if (_error != null)
          TextButton(onPressed: _load, child: Text('$_error · Retry')),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
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
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        padding: const EdgeInsets.all(12),
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.sizeOf(context).width * .76,
                        ),
                        decoration: BoxDecoration(
                          color: own ? AppColors.primaryGreen : Colors.white,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text('${message['body']}'),
                      ),
                    );
                  },
                ),
        ),
        Row(
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
            IconButton(
              onPressed: _sending ? null : _send,
              tooltip: 'Send',
              icon: _sending
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send),
            ),
          ],
        ),
        const SizedBox(height: 12),
      ],
    ),
  );
}
