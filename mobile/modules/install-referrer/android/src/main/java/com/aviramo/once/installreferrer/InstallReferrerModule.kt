package com.aviramo.once.installreferrer

import java.util.concurrent.atomic.AtomicBoolean

import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Reads the Google Play Install Referrer string. This is the whole of the
// referral attribution mechanism on Android: the share link sends the invitee
// to the Play listing with `?referrer=ref%3D<CODE>`, Play carries that string
// through the install, and this module hands it back on first launch. The
// invitee never sees or types anything.
//
// The API is deliberately forgiving: EVERY failure path resolves null rather
// than rejecting. A missing referrer is the normal case (installed straight
// from the store, sideloaded, Play Services absent), not an error, and the
// caller must never surface it to the user.
class InstallReferrerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InstallReferrer")

    AsyncFunction("getInstallReferrer") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      // startConnection's listener can fire more than once (a service
      // disconnect after a completed setup), and a Promise may only be
      // settled once, so gate every exit behind this flag.
      val settled = AtomicBoolean(false)
      fun settle(value: String?) {
        if (settled.compareAndSet(false, true)) promise.resolve(value)
      }

      try {
        val client = InstallReferrerClient.newBuilder(context).build()
        client.startConnection(object : InstallReferrerStateListener {
          override fun onInstallReferrerSetupFinished(responseCode: Int) {
            var referrer: String? = null
            try {
              if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                referrer = client.installReferrer?.installReferrer
              }
            } catch (_: Throwable) {
              // getInstallReferrer throws if the service died mid-call.
            }
            try { client.endConnection() } catch (_: Throwable) {}
            settle(referrer)
          }

          override fun onInstallReferrerServiceDisconnected() {
            // No retry: the caller re-asks on a later launch until it has
            // either a referrer or a confirmed attach, so a one-shot null
            // here loses nothing.
            settle(null)
          }
        })
      } catch (_: Throwable) {
        settle(null)
      }
    }
  }
}
