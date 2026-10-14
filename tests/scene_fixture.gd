extends RefCounted
## Scene disposal must allow the real audio mixer to release Vorbis playback.


static func stop_audio(node: Node) -> void:
	if node is AudioStreamPlayer or node is AudioStreamPlayer3D or node is AudioStreamPlayer2D:
		node.stop()
		node.stream = null
	for child in node.get_children():
		stop_audio(child)


static func dispose_scene(tree: SceneTree, scene: Node) -> void:
	stop_audio(scene)
	scene.queue_free()
	await tree.process_frame
	# Process-frame counts and SceneTreeTimer follow simulated time. The audio
	# thread uses wall time, so fast CI or --fixed-fps must still drain its mixer.
	var drain_until := Time.get_ticks_msec() + 150
	while Time.get_ticks_msec() < drain_until:
		OS.delay_msec(5)
		await tree.process_frame
