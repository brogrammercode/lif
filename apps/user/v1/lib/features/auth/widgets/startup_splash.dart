import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

class StartupSplash extends StatefulWidget {
  final VoidCallback onFinished;
  final bool play;

  const StartupSplash({super.key, required this.onFinished, this.play = true});

  @override
  State<StartupSplash> createState() => _StartupSplashState();
}

class _StartupSplashState extends State<StartupSplash> {
  // The supplied clip opens on black. Use the same branded frame for the
  // poster and playback handoff so a slow decoder doesn't flash black.
  static const _posterPosition = Duration(milliseconds: 800);
  late final VideoPlayerController _video = VideoPlayerController.asset(
    'assets/videos/splash.mp4',
    videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
  );
  Timer? _deadline;
  late final bool _started;
  bool _showVideo = false;
  bool _finished = false;

  @override
  void initState() {
    super.initState();
    _started = widget.play;
    if (!_started) return;
    _video.addListener(_onVideoChanged);
    _deadline = Timer(const Duration(seconds: 3), _usePoster);
    unawaited(_play());
  }

  Future<void> _play() async {
    try {
      await _video.initialize();
      if (!mounted || _finished) return;
      await _video.setVolume(0);
      if (!mounted || _finished) return;
      await _video.seekTo(_posterPosition);
      if (!mounted || _finished) return;
      _deadline?.cancel();
      _deadline = Timer(
        _video.value.duration + const Duration(seconds: 1),
        _usePoster,
      );
      await _video.play();
    } catch (_) {
      _usePoster();
    }
  }

  void _onVideoChanged() {
    if (!mounted || _finished) return;
    final value = _video.value;
    if (value.hasError) {
      _usePoster();
      return;
    }
    if (value.isCompleted) {
      _finish();
    } else if (!_showVideo &&
        value.isPlaying &&
        value.position > _posterPosition) {
      setState(() => _showVideo = true);
    }
  }

  void _usePoster() {
    if (!mounted || _finished) return;
    if (_showVideo) setState(() => _showVideo = false);
    _finish();
  }

  void _finish() {
    _finished = true;
    _deadline?.cancel();
    widget.onFinished();
  }

  @override
  void dispose() {
    _deadline?.cancel();
    if (_started) {
      _video.removeListener(_onVideoChanged);
      unawaited(_video.dispose());
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: SystemUiOverlayStyle.light,
    child: ColoredBox(
      color: Colors.black,
      child: _showVideo
          ? SizedBox.expand(
              child: FittedBox(
                fit: BoxFit.cover,
                clipBehavior: Clip.hardEdge,
                child: SizedBox.fromSize(
                  size: _video.value.size,
                  child: VideoPlayer(_video),
                ),
              ),
            )
          : Image.asset(
              'assets/images/splash-poster.jpg',
              fit: BoxFit.cover,
              excludeFromSemantics: true,
            ),
    ),
  );
}
