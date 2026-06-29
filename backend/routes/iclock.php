<?php

use App\Http\Controllers\Adms\IclockController;
use Illuminate\Support\Facades\Route;

/*
 * ZKTeco ADMS / "iclock" push protocol. The device POSTs attendance here on its
 * own — no auth/CSRF/session (the terminal can't do those). Responses are plain
 * text. Devices are identified by their serial number (?SN=...).
 */
Route::match(['get', 'post'], '/iclock/cdata', [IclockController::class, 'cdata']);
Route::get('/iclock/getrequest', [IclockController::class, 'getrequest']);
Route::match(['get', 'post'], '/iclock/devicecmd', [IclockController::class, 'devicecmd']);

// Any other iclock path (fdata, edata, ping, …): log it and acknowledge.
Route::match(['get', 'post'], '/iclock/{any}', [IclockController::class, 'fallback'])->where('any', '.*');
