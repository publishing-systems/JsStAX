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
/** @todo The regex to match alphabetic letters is way too primitive, but
  * JavaScript doesn't offer a proper Unicode alternative. */

"use strict";

function createXMLEventReader(stream)
{
    return new XMLEventReader(stream);
}

function XMLEventReader(stream)
{
    let self = this;

    let _stream = stream;
    let _hasNextCalled = false;
    let _events = [];

    let _entityReplacementDictionary = [];
    _entityReplacementDictionary["amp"] = "&";
    _entityReplacementDictionary["lt"] = "<";
    _entityReplacementDictionary["gt"] = ">";
    _entityReplacementDictionary["apos"] = "'";
    _entityReplacementDictionary["quot"] = "\"";

    /** @todo Load more from a catalogue, which itself is written in XML and needs to be read
      * in here by another local XMLEventReader object, containing mappings from entity to
      * replacement characters. No need to deal with DTDs as they're non-XML, and extracting
      * those mappings from a DTD can be a separate program or manual procedure. Also see
      * intermediate workaround method XMLEventReader.addToEntityReplacementDictionary(). */

    self.hasNext = function()
    {
        if (_events.length > 0)
        {
            return true;
        }

        if (self._hasNextCalled == true)
        {
            return false;
        }
        else
        {
            self._hasNextCalled = true;
        }

        let byte = _stream.get();

        if (_stream.eof() == true)
        {
            return false;
        }

        if (_stream.bad() == true)
        {
            throw "Stream is bad.";
        }

        if (byte == '<')
        {
            return HandleTag();
        }
        else
        {
            return HandleText(byte);
        }
    }

    self.nextEvent = function()
    {
        if (_events.length <= 0 &&
            self._hasNextCalled == false)
        {
            if (self.hasNext() != true)
            {
                throw "Attempted XMLEventReader.nextEvent() while there isn't one instead of checking XMLEventReader.hasNext() first.";
            }
        }

        self._hasNextCalled = false;

        if (_events.length <= 0)
        {
            throw "XMLEventReader.nextEvent() while there isn't one, ignoring XMLEventReader.hasNext() == false.";
        }

        return _events.shift();
    }
 
    function HandleText(firstByte)
    {
        let data = "";

        if (firstByte == '&')
        {
            data += ResolveEntity();
        }
        else
        {
            data += firstByte;
        }

        while (true)
        {
            let byte = _stream.get();

            if (_stream.eof() == true)
            {
                break;
            }

            if (_stream.bad() == true)
            {
                throw "Stream is bad.";
            }

            if (byte == '<')
            {
                _stream.unget();

                if (_stream.bad() == true)
                {
                    throw "Stream is bad.";
                }

                break;
            }
            else if (byte == '&')
            {
                data += ResolveEntity();
            }
            else
            {
                data += byte;
            }
        }

        let event = new Characters(data);
        _events.push(event);

        return true;
    }

    function HandleTag()
    {
        let byte = _stream.get();

        if (_stream.eof() == true)
        {
            throw "Tag incomplete."
        }

        if (_stream.bad() == true)
        {
            throw "Stream is bad.";
        }

        if (byte == '?')
        {
            if (HandleProcessingInstruction() == true)
            {
                return true;
            }
            else
            {
                self._hasNextCalled = false;
                return self.hasNext();
            }
        }
        else if (byte == '/')
        {
            return HandleTagEnd();
        }
        else if (byte == '!')
        {
            return HandleMarkupDeclaration();
        }
        else if (/[a-zA-Z]/.test(byte) == true ||
                 byte == '_')
        {
            return HandleTagStart(byte);
        }
        else
        {
            throw "Unknown byte '" + byte + "' within element.";
        }
    }

    function HandleProcessingInstruction()
    {
        let target = HandleProcessingInstructionTarget();

        if (typeof target == "undefined")
        {
            throw "Processing instruction without target name.";
        }

        if (target.length == 3)
        {
            if ((target.charAt(0) == 'x' ||
                 target.charAt(0) == 'X') &&
                (target.charAt(1) == 'm' ||
                 target.charAt(1) == 'M') &&
                (target.charAt(2) == 'l' ||
                 target.charAt(2) == 'L'))
            {
                /** @todo This should read the XML declaration instructions instead
                  * of just consuming/ignoring it. */

                let byte;
                let matchCount = 0;

                while (matchCount < 2)
                {
                    byte = _stream.get();

                    if (_stream.eof() == true)
                    {
                        throw "XML declaration incomplete.";
                    }

                    if (_stream.bad() == true)
                    {
                        throw "Stream is bad.";
                    }

                    if (byte == '?' &&
                        matchCount <= 0)
                    {
                        matchCount++;
                    }
                    else if (byte == '>' &&
                             matchCount <= 1)
                    {
                        return false;
                    }
                }

                return false;
            }
        }

        let data = "";
        let byte;
        let matchCount = 0;

        while (matchCount < 2)
        {
            byte = _stream.get();

            if (_stream.eof() == true)
            {
                throw "Processing instruction data incomplete.";
            }

            if (_stream.bad() == true)
            {
                throw "Stream is bad.";
            }

            if (byte == '?' &&
                matchCount <= 0)
            {
                matchCount++;
            }
            else if (byte == '>' &&
                     matchCount <= 1)
            {
                //matchCount++;

                let event = new ProcessingInstruction(target, data);
                _events.push(event);

                return true;
            }
            else
            {
                if (matchCount > 0)
                {
                    data += '?';
                }

                matchCount = 0;

                data += byte;
            }
        }

        return false;
    }

    function HandleProcessingInstructionTarget()
    {
        let name = "";
        let byte;
        let matchCount = 0;

        while (matchCount < 2)
        {
            byte = _stream.get();

            if (_stream.eof() == true)
            {
                throw "Processing instruction target name incomplete.";
            }

            if (_stream.bad() == true)
            {
                throw "Stream is bad.";
            }

            if (byte == '?' &&
                matchCount <= 0)
            {
                matchCount++;
            }
            else if (byte == '>' &&
                     matchCount <= 1)
            {
                throw "Processing instruction ended before processing instruction target name could be read.";
            }
            else if (/^\s+$/.test(byte) == true)
            {
                if (name.length <= 0)
                {
                    throw "Processing instruction without target name.";
                }

                return name;
            }
            else
            {
                if (matchCount > 0)
                {
                    throw "Processing instruction target name interrupted by '?'.";
                }

                if (name.length <= 0)
                {
                    if (/[a-zA-Z]/.test(byte) != true)
                    {
                        throw "Character '" + byte + "' not supported as first character of an processing instruction target name.";
                    }
                }

                name += byte;
            }
        }

        return undefined;
    }

    function HandleTagStart(firstByte)
    {
        let byte = _stream.get();

        if (_stream.eof() == true)
        {
            throw "Tag start incomplete.";
        }

        if (_stream.bad() == true)
        {
            throw "Stream is bad.";
        }

        let namePrefix = "";
        let nameLocalPart = "";
        let attributes = [];

        nameLocalPart += firstByte;

        do
        {
            /** @todo Check, if special characters appear at the very start where not allowed.
              * This might apply for the namespace prefix as well as for the element name. */

            if (byte == ':')
            {
                if (namePrefix.length > 0)
                {
                    throw "There can't be two prefixes in element name.";
                }

                namePrefix = nameLocalPart;
                nameLocalPart = "";
            }
            else if (byte == '>')
            {
                let name = new QName("", nameLocalPart, namePrefix);
                let startElement = new StartElement(name, attributes);

                _events.push(startElement);

                break;
            }
            else if (byte == '/')
            {
                byte = _stream.get();

                if (_stream.eof() == true)
                {
                    throw "Tag start incomplete.";
                }

                if (_stream.bad() == true)
                {
                    throw "Stream is bad.";
                }

                if (byte != '>')
                {
                    throw "Empty start + end tag end without closing '>'.";
                }

                let name = new QName("", nameLocalPart, namePrefix);
                let startElement = new StartElement(name, attributes);
                _events.push(startElement);

                name = new QName("", nameLocalPart, namePrefix);
                let endElement = new EndElement(name);
                _events.push(endElement);

                break;
            }
            else if (/^\s+$/.test(byte) == true)
            {
                if (nameLocalPart.length <= 0)
                {
                    throw "Start tag name begins with whitespace.";
                }

                while (true)
                {
                    byte = _stream.get();

                    if (_stream.eof() == true)
                    {
                        throw "Tag start incomplete.";
                    }

                    if (_stream.bad() == true)
                    {
                        throw "Stream is bad.";
                    }

                    if (byte == '>')
                    {
                        break;
                    }
                    else if (/^\s+$/.test(byte) == true)
                    {
                        // Ignore/consume.
                    }
                    else if (byte == '/')
                    {
                        _stream.unget();

                        if (_stream.bad() == true)
                        {
                            throw "Stream is bad.";
                        }

                        break;
                    }
                    else
                    {
                        attributes = HandleAttributes(byte);
                        break;
                    }
                }
            }
            /** @todo The check was isalnum(), so it should support Unicode. */
            else if (/[a-zA-Z0-9]/.test(byte) == true ||
                     byte == '-' ||
                     byte == '_' ||
                     byte == '.')
            {
                nameLocalPart += byte;
            }
            else
            {
                throw "Character '" + byte + "' not supported in a start tag name.";
            }

            byte = _stream.get();

            if (_stream.eof() == true)
            {
                throw "Tag start incomplete.";
            }

            if (_stream.bad() == true)
            {
                throw "Stream is bad.";
            }

        } while (true);

        return true;
    }

    function HandleMarkupDeclaration()
    {
        let byte = _stream.get();

        if (_stream.eof() == true)
        {
            throw "Markup declaration incomplete.";
        }

        if (_stream.bad() == true)
        {
            throw "Steam is bad.";
        }

        if (byte == '-')
        {
            return HandleComment();
        }
        else
        {
            throw "Markup declaration type not implemented yet.";
        }

        return true;
    }

    function HandleComment()
    {
        let byte = _stream.get();

        if (_stream.eof() == true)
        {
            throw "Comment incomplete.";
        }

        if (_stream.bad() == true)
        {
            throw "Stream is bad.";
        }

        if (byte != '-')
        {
            throw "Comment malformed.";
        }

        let data = "";

        let matchCount = 0;
        let endSequence = [ '-', '-', '>' ];

        do
        {
            byte = _stream.get();

            if (_stream.eof() == true)
            {
                throw "Comment incomplete.";
            }

            if (_stream.bad() == true)
            {
                throw "Stream is bad.";
            }

            if (byte == endSequence[matchCount])
            {
                if (matchCount + 1 < endSequence.length)
                {
                    ++matchCount;
                }
                else
                {
                    let comment = new Comment(data);
                    _events.push(comment);

                    break;
                }
            }
            else
            {
                if (matchCount > 0)
                {
                    for (let i = 0; i < matchCount; i++)
                    {
                        data += endSequence[i];
                    }

                    data += byte;
                    matchCount = 0;
                }
                else
                {
                    data += byte;
                }
            }

        } while (true);

        return true;
    }

    function HandleAttributes(firstByte)
    {
        let attributes = [];

        let attributeName = HandleAttributeName(firstByte);
        let attributeValue = HandleAttributeValue();
        attributes.push(new Attribute(attributeName, attributeValue));

        let byte;

        do
        {
            byte = _stream.get();

            if (_stream.eof() == true)
            {
                throw "Tag start incomplete.";
            }

            if (_stream.bad() == true)
            {
                throw "Stream is bad.";
            }

            if (byte == '>')
            {
                // Not part of the attributes any more and indicator for outer
                // methods to complete the StartElement.
                _stream.unget();

                break;
            }
            else if (byte == '/')
            {
                byte = _stream.get(byte);

                if (_stream.eof() == true)
                {
                    throw "Tag start incomplete.";
                }

                if (_stream.bad() == true)
                {
                    throw "Stream is bad.";
                }

                if (byte != '>')
                {
                    throw "Empty start + end tag end without closing '>'.";
                }

                _stream.unget();

                if (_stream.bad() == true)
                {
                    throw "Stream is bad.";
                }

                _stream.unget();

                if (_stream.bad() == true)
                {
                    throw "Stream is bad.";
                }

                break;
            }
            else if (/^\s+$/.test(byte) == true)
            {
                // Ignore/consume.
                continue;
            }
            else
            {
                attributeName = HandleAttributeName(byte);
                attributeValue = HandleAttributeValue();

                attributes.push(new Attribute(attributeName, attributeValue));
            }

        } while (true);

        return attributes;
    }

    function HandleAttributeName(firstByte)
    {
        let namePrefix = "";
        let nameLocalPart = "";

        if (/[a-zA-Z]/.test(firstByte) == true ||
            firstByte == '_')
        {
            nameLocalPart += firstByte;
        }
        else
        {
            throw "Character '" + byte + "' not supported as first character of an attribute name.";
        }

        let byte;

        do
        {
            byte = _stream.get();

            if (_stream.eof() == true)
            {
                throw "Attribute name incomplete.";
            }

            if (_stream.bad() == true)
            {
                throw "Stream is bad.";
            }

            if (byte == ':')
            {
                if (namePrefix.length > 0)
                {
                    throw "There can't be two prefixes in attribute name.";
                }

                namePrefix = nameLocalPart;
                nameLocalPart = "";
            }
            else if (/^\s+$/.test(byte) == true)
            {
                byte = ConsumeWhitespace();

                if (byte == '\0')
                {
                    throw "Attribute incomplete.";
                }
                else if (byte != '=')
                {
                    throw "Attribute name is malformed.";
                }

                // To make sure that the next loop iteration will end up in cByte == '='.
                _stream.unget();

                if (_stream.bad() == true)
                {
                    throw "Stream is bad.";
                }
            }
            else if (byte == '=')
            {
                return new QName("", nameLocalPart, namePrefix);
            }
            else if (/[a-zA-Z0-9]/.test(byte) == true ||
                     byte == '-' ||
                     byte == '_' ||
                     byte == '.')
            {
                nameLocalPart += byte;
            }
            else
            {
                throw "Character '" + byte + "' not supported in an attribute name.";
            }

        } while (true);

        return undefined;
    }

    function HandleAttributeValue()
    {
        let value = "";
        let delimiter = ConsumeWhitespace();

        if (delimiter == '\0')
        {
            throw "Attribute is missing its value.";
        }
        else if (delimiter != '\'' &&
                 delimiter != '"')
        {
            throw "Attribute value doesn't start with a delimiter like ''' or '\"', instead, '" + delimiter + "' was found.";
        }

        let byte;

        do
        {
            byte = _stream.get();

            if (_stream.eof() == true)
            {
                throw "Attribute value incomplete.";
            }

            if (_stream.bad() == true)
            {
                throw "Stream is bad.";
            }

            if (byte == delimiter)
            {
                return value;
            }
            else if (byte == '&')
            {
                value += ResolveEntity();
            }
            else
            {
                value += byte;
            }

        } while (true);

        return undefined;
    }

    /**
     * @retval Returns the first non-whitespace character or '\0' in
     *     case of end-of-file.
     */
    function ConsumeWhitespace()
    {
        let byte;

        do
        {
            byte = _stream.get();

            if (_stream.eof() == true)
            {
                return '\0';
            }

            if (_stream.bad() == true)
            {
                throw "Stream is bad.";
            }

            if (/^\s+$/.test(byte) != true)
            {
                return byte;
            }

        } while (true);
    }

    self.addToEntityReplacementDictionary = function(name, replacementText)
    {
        if (name == "amp" ||
            name == "lt" ||
            name == "gt" ||
            name == "apos" ||
            name == "quot")
        {
            throw "Redefinition of built-in entity.";
        }

        _entityReplacementDictionary[name] = replacementText;
    }

    function ResolveEntity()
    {
        let byte = _stream.get();

        if (_stream.eof() == true)
        {
            throw "Entity incomplete.";
        }

        if (_stream.bad() == true)
        {
            throw "Stream is bad.";
        }

        if (byte == ';')
        {
            throw "Entity has no name.";
        }
        else
        {
            let name = "";
            name += byte;

            do
            {
                byte = _stream.get();

                if (_stream.eof() == true)
                {
                    throw "Entity incomplete.";
                }

                if (_stream.bad() == true)
                {
                    throw "Stream is bad.";
                }

                if (byte == ';')
                {
                    break;
                }

                name += byte;

            } while (true);

            if (name in _entityReplacementDictionary)
            {
                return _entityReplacementDictionary[name];
            }
            else
            {
                throw "Unable to resolve entity '&" + name + ";'.";
            }
        }
    }

    function HandleTagEnd()
    {
        let byte = _stream.get();

        if (_stream.eof() == true)
        {
            throw "Tag end incomplete.";
        }

        if (_stream.bad() == true)
        {
            throw "Stream is bad.";
        }

        let namePrefix = "";
        let nameLocalPart = "";

        // No validity check for the XML element name is needed
        // if end tags are compared to start tags and the start
        // tags were already checked.

        let complete = false;

        do
        {
            if (byte == ':')
            {
                if (namePrefix.length > 0)
                {
                    throw "There can't be two prefixes in the element name.";
                }

                namePrefix = nameLocalPart;
                nameLocalPart = "";
            }
            else if (byte == '>')
            {
                let name = new QName("", nameLocalPart, namePrefix);
                let endElement = new EndElement(name);
                _events.push(endElement);

                complete = true;
                break;
            }
            else if (/[a-zA-Z0-9]/.test(byte) == true ||
                     byte == '-' ||
                     byte == '_' ||
                     byte == '.')
            {
                nameLocalPart += byte;
            }
            else
            {
                throw "Character '" + byte + "' not supported in an end tag name.";
            }

            byte = _stream.get();

            if (_stream.eof() == true)
            {
                throw "End tag incomplete.";
            }

            if (_stream.bad() == true)
            {
                throw "Stream is bad.";
            }

        } while (true);

        if (complete != true)
        {
            throw "End tag incomplete.";
        }

        return true;
    }
}

function Characters(data)
{
    let self = this;

    if (data.length <= 0)
    {
        throw "No characters."
    }

    let _data = data;
    let _isWhiteSpace = /^\s+$/.test(self._data);

    self.getData = function()
    {
        return _data;
    }

    self.isWhiteSpace = function()
    {
        return _isWhiteSpace;
    }
}

function QName(namespaceURI, localPart, prefix)
{
    let self = this;

    let _namespaceURI = namespaceURI;
    let _localPart = localPart;
    let _prefix = prefix;

    self.getNamespaceURI = function()
    {
        return _namespaceURI;
    }

    self.getLocalPart = function()
    {
        return _localPart;
    }

    self.getPrefix = function()
    {
        return _prefix;
    }

    /** @todo Comparison. */
    // bool operator==(const QName& rhs) const;
}

function StartElement(name, attributes)
{
    let self = this;

    if (!(name instanceof QName))
    {
        throw "StartElement(): Passed name argument isn't a QName object.";
    }

    if (Array.isArray(attributes) != true)
    {
        throw "Start element: No attributes array passed.";
    }

    let _name = name;
    let _attributes = attributes;

    self.getAttributeByName = function(name)
    {
        if (!(name instanceof QName))
        {
            throw "StartElement.getAttributeByName(): Passed name argument isn't a QName object.";
        }

        /** @todo Implement this method and don't forget QName::operator==(). */
    }

    self.getAttributes = function()
    {
        return _attributes;
    }

    self.getName = function()
    {
        return _name;
    }
}

function ProcessingInstruction(target, data)
{
    let self = this;

    let _target = target;
    let _data = data;

    self.getData = function()
    {
        return _data;
    }

    self.getTarget = function()
    {
        return _target;
    }
}

function Attribute(name, value)
{
    let self = this;

    if (!(name instanceof QName))
    {
        throw "Attribute(): Passed name argument isn't a QName object.";
    }

    self._name = name;
    self._value = value;

    self.getName = function()
    {
        return self._name;
    }

    self.getValue = function()
    {
        return self._value;
    }
}

function EndElement(name)
{
    let self = this;

    if (!(name instanceof QName))
    {
        throw "EndElement(): Passed name argument isn't a QName object.";
    }

    let _name = name;

    self.getName = function()
    {
        return _name;
    }
}

function Comment(text)
{
    let self = this;
    let _text = text;

    self.getText = function()
    {
        return _text;
    }
}
