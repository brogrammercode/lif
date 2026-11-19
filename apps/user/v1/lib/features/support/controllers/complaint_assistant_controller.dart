import 'dart:async';

import 'package:user/core/state/feature_controller.dart';

class ComplaintChatMessage {
  final String text;
  final bool fromUser;
  final DateTime createdAt;

  const ComplaintChatMessage({
    required this.text,
    required this.fromUser,
    required this.createdAt,
  });
}

/// Keeps the pre-agent help conversation local until the rider requests a person.
class ComplaintAssistantController extends FeatureController {
  ComplaintAssistantController() {
    messages = [
      ComplaintChatMessage(
        text:
            'Hi, I’m the 1More Assistant. Tell me what happened and I’ll try to help. If you still need help, you can connect with a support agent anytime.',
        fromUser: false,
        createdAt: DateTime.now(),
      ),
    ];
  }

  List<ComplaintChatMessage> messages = const [];
  bool replying = false;
  Timer? _replyTimer;
  String? get latestUserMessage =>
      messages.where((message) => message.fromUser).lastOrNull?.text;

  void send(String value) {
    final text = value.trim();
    if (text.isEmpty || replying || isDisposed) return;
    update(() {
      messages = [
        ...messages,
        ComplaintChatMessage(
          text: text,
          fromUser: true,
          createdAt: DateTime.now(),
        ),
      ];
      replying = true;
    });
    _replyTimer?.cancel();
    _replyTimer = Timer(const Duration(milliseconds: 450), () {
      if (isDisposed) return;
      update(() {
        messages = [
          ...messages,
          ComplaintChatMessage(
            text: _replyFor(text),
            fromUser: false,
            createdAt: DateTime.now(),
          ),
        ];
        replying = false;
      });
    });
  }

  String _replyFor(String input) {
    final text = input.toLowerCase();
    if (RegExp(r'pay|payment|cash|upi|fare|charged|wallet').hasMatch(text)) {
      return 'Ride payments are made directly to the driver in cash or UPI. If a fare or payment looks wrong, share the ride details with a support agent and they can review it.';
    }
    if (RegExp(r'driver|pickup|route|ride|trip|late|cancel').hasMatch(text)) {
      return 'I can help with ride issues. Open My Rides to find the trip and its details. If this needs a trip review, connect with a support agent and include the ride reference.';
    }
    if (RegExp(r'account|profile|phone|email|number').hasMatch(text)) {
      return 'You can update your name or phone number from Profile settings. Tap the value you want to change, then save your changes.';
    }
    if (RegExp(r'app|crash|error|bug|screen|login').hasMatch(text)) {
      return 'Please tell me which screen you were using and what happened just before the issue. If the problem is still blocking you, a support agent can investigate with those details.';
    }
    if (RegExp(r'lost|item|belonging|forgot').hasMatch(text)) {
      return 'For an item left in a vehicle, open the ride in My Rides and contact support with the ride reference and a description of the item.';
    }
    return 'I’m not able to resolve this from the help available here. Please add the details in a complaint and a support agent will follow up.';
  }

  @override
  void dispose() {
    _replyTimer?.cancel();
    super.dispose();
  }
}
