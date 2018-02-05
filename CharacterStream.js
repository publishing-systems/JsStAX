/* Copyright (C) 2018 Stephan Kreutzer
 *
 * This file is part of JsStAX.
 *
 * JsStAX is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License version 3 or any later
 * version of the license, as published by the Free Software Foundation.
 *
 * JsStAX is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License 3 for more details.
 *
 * You should have received a copy of the GNU Affero General Public License 3
 * along with JsStAX. If not, see <http://www.gnu.org/licenses/>.
 */

function CharacterStream(string)
{
    var self = this;

    self._string = string;
    self._cursor = 0;
    self._bad = false;
    self._eof = false;

    self.get = function()
    {
        if (self._cursor >= self._string.length)
        {
            self._bad = true;
            self._eof = true;
            return '\0';
        }

        ++self._cursor;

        return self._string.charAt(self._cursor - 1);
    }

    self.unget = function()
    {
        if (self._cursor <= 0)
        {
            self._bad = true;
        }

        --self._cursor;
    }

    self.eof = function()
    {
        return self._eof;
    }

    self.bad = function()
    {
        return self._bad;
    }
}
