/**
 * AyushLink — Real-Time WebRTC Peer Connection & Media Manager
 *
 * Coordinates browser-to-browser WebRTC audio/video streams:
 * - Public Google STUN servers for NAT traversal / ICE candidate gathering
 * - Clean MediaStream lifecycle (starts on explicit join, releases all hardware tracks on leave)
 * - Track muting/unmuting without breaking the WebRTC transceiver pipeline
 */

export const RTC_CONFIGURATION = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
}

export class WebRTCManager {
  constructor({
    onRemoteStream,
    onLocalStream,
    onIceCandidate,
    onConnectionStateChange,
    onError,
  }) {
    this.onRemoteStream = onRemoteStream
    this.onLocalStream = onLocalStream
    this.onIceCandidate = onIceCandidate
    this.onConnectionStateChange = onConnectionStateChange
    this.onError = onError

    this.peerConnection = null
    this.localStream = null
    this.remoteStream = new MediaStream()
    this.isMuted = false
    this.isCameraOff = false
  }

  /**
   * Request real camera & microphone media from browser.
   * NEVER called automatically — only upon explicit "Join Video Consultation" click.
   */
  async getLocalMedia({ video = true, audio = true } = {}) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "user",
            }
          : false,
        audio: audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
      })

      this.localStream = stream
      if (this.onLocalStream) {
        this.onLocalStream(stream)
      }
      return stream
    } catch (err) {
      console.error("[WebRTC] getUserMedia error:", err)
      if (this.onError) {
        this.onError(err)
      }
      throw err
    }
  }

  /**
   * Initialize RTCPeerConnection and attach local tracks.
   */
  createPeerConnection() {
    this.cleanupPeerConnection()

    this.peerConnection = new RTCPeerConnection(RTC_CONFIGURATION)
    this.remoteStream = new MediaStream()

    // Attach local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream)
      })
    }

    // Handle remote track arrival
    this.peerConnection.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        this.remoteStream.addTrack(track)
      })
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream)
      }
    }

    // Handle ICE candidates to relay via signaling
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate)
      }
    }

    // Connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state)
      }
    }

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection.iceConnectionState
      if (iceState === "failed" || iceState === "disconnected") {
        console.warn("[WebRTC] ICE state:", iceState)
      }
    }

    return this.peerConnection
  }

  /**
   * Create and set local SDP Offer.
   */
  async createOffer() {
    if (!this.peerConnection) this.createPeerConnection()
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    })
    await this.peerConnection.setLocalDescription(offer)
    return offer
  }

  /**
   * Handle incoming SDP Offer, set remote description, and create SDP Answer.
   */
  async createAnswer(remoteOffer) {
    if (!this.peerConnection) this.createPeerConnection()
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteOffer))
    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)
    return answer
  }

  /**
   * Set incoming SDP Answer on local peer connection.
   */
  async handleAnswer(remoteAnswer) {
    if (!this.peerConnection) return
    if (this.peerConnection.signalingState !== "stable") {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteAnswer))
    }
  }

  /**
   * Add ICE candidate received from remote peer.
   */
  async addIceCandidate(candidate) {
    if (!this.peerConnection) return
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (err) {
      console.warn("[WebRTC] Error adding ICE candidate:", err)
    }
  }

  /**
   * Toggle local microphone audio.
   */
  toggleAudio() {
    if (!this.localStream) return false
    const audioTrack = this.localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      this.isMuted = !audioTrack.enabled
      return audioTrack.enabled
    }
    return false
  }

  /**
   * Toggle local camera video.
   */
  toggleVideo() {
    if (!this.localStream) return false
    const videoTrack = this.localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      this.isCameraOff = !videoTrack.enabled
      return videoTrack.enabled
    }
    return false
  }

  cleanupPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.ontrack = null
      this.peerConnection.onicecandidate = null
      this.peerConnection.onconnectionstatechange = null
      this.peerConnection.close()
      this.peerConnection = null
    }
  }

  /**
   * Clean up all media tracks, video elements, and WebRTC peer connection.
   */
  cleanup() {
    this.cleanupPeerConnection()
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => track.stop())
      this.remoteStream = new MediaStream()
    }
  }
}
